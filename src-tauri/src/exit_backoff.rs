//! 出口的被拒记录，以及只有一个出口时的放慢探测。
//!
//! 跟随系统代理和指定节点两种模式只有一个出口，被 Apple 拒绝后无路可换。以前
//! 每轮仍按用户设置的间隔探测一次；Apple 按出口 IP 计数，封禁期间不停探测会让
//! 封禁迟迟不解除 —— 实测家庭宽带每 30 秒探测一次，连续四十多分钟都是 541。这里
//! 在连续几轮被拒后逐级放慢探测，拿到一次正常响应就恢复用户设置的间隔。
//!
//! 被拒记录也给界面用：告诉用户这个出口从什么时候起一直被拒、被拒了几次。Clash
//! 轮换模式同样记账但不放慢，那边由线路池按节点冷却并换节点。送货查询另有一份
//! 同样的记录：送货接口被拒时只放慢送货，不影响取货。这里只做记账，不发任何
//! 网络请求。

use std::collections::hash_map::Entry;
use std::collections::{HashMap, HashSet};
use std::time::{Duration, Instant, SystemTime};

/// 连续这么多轮被拒后开始放慢。一两轮被拒可能只是偶发，仍按用户设置的间隔重试。
pub const SLOW_DOWN_AFTER_ROUNDS: u32 = 3;

/// 放慢后两次探测之间的等待：探测仍被拒绝时逐级延长，最长 15 分钟。
///
/// 只有一个出口时等得越久，解封后越晚发现，所以比 Clash 节点 5～30 分钟的冷却
/// 短；但要尽快拉开到十几分钟，否则探测本身就会让封禁延续下去。
pub const PROBE_STEPS: [Duration; 4] = [
    Duration::from_secs(2 * 60),
    Duration::from_secs(5 * 60),
    Duration::from_secs(10 * 60),
    Duration::from_secs(15 * 60),
];

/// 某个 Apple 站点从第一次被拒起、一直没拿到正常响应的这段记录。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Streak {
    /// 第一次被拒的时刻。
    pub since: SystemTime,
    /// 最近一次被拒时使用的出口说明。
    pub route: String,
    /// 被拒的请求数。
    pub rejections: u32,
    /// 有请求被拒的轮次数；同一轮里多次被拒只算一轮。
    rounds: u32,
    last_cycle: u64,
    /// 放慢探测时，下一次允许向 Apple 发请求的时刻。
    resume_at: Option<Instant>,
}

/// 按 Apple 站点主机名记账，与线路池一致：港澳日新澳马共用 `www.apple.com`，
/// 同一出口在这些地区之间的请求很可能合并计数。
#[derive(Debug, Default)]
pub struct ExitBackoff {
    streaks: HashMap<String, Streak>,
}

impl ExitBackoff {
    /// 记录一次拒绝。
    ///
    /// `slow_down` 为 `true`（只有一个出口）且连续被拒的轮次达到阈值时，安排下一次
    /// 探测并返回要等多久；其余情况只记账，返回 `None`。同一轮里的后续拒绝不升档。
    pub fn reject(
        &mut self,
        site: &str,
        route: String,
        cycle: u64,
        slow_down: bool,
        now: Instant,
        wall: SystemTime,
    ) -> Option<Duration> {
        let streak = match self.streaks.entry(site.to_string()) {
            Entry::Vacant(entry) => entry.insert(Streak {
                since: wall,
                route,
                rejections: 1,
                rounds: 1,
                last_cycle: cycle,
                resume_at: None,
            }),
            Entry::Occupied(entry) => {
                let streak = entry.into_mut();
                streak.route = route;
                streak.rejections = streak.rejections.saturating_add(1);
                if streak.last_cycle == cycle {
                    return None;
                }
                streak.last_cycle = cycle;
                streak.rounds = streak.rounds.saturating_add(1);
                streak
            }
        };
        if !slow_down || streak.rounds < SLOW_DOWN_AFTER_ROUNDS {
            return None;
        }
        let level = (streak.rounds - SLOW_DOWN_AFTER_ROUNDS) as usize;
        let wait = PROBE_STEPS[level.min(PROBE_STEPS.len() - 1)];
        streak.resume_at = Some(now + wait);
        Some(wait)
    }

    /// 该站点拿到了正常响应：清除记录，下一轮恢复用户设置的间隔。返回此前是否被拒过。
    pub fn succeed(&mut self, site: &str) -> bool {
        self.streaks.remove(site).is_some()
    }

    /// 放慢探测期间距离下一次探测还有多久；不在等待中时为 `None`。
    pub fn wait_for(&self, site: &str, now: Instant) -> Option<Duration> {
        self.streaks
            .get(site)?
            .resume_at
            .map(|at| at.saturating_duration_since(now))
            .filter(|remaining| !remaining.is_zero())
    }

    pub fn streak(&self, site: &str) -> Option<&Streak> {
        self.streaks.get(site)
    }

    /// 被拒最久的那段记录，供界面说明。
    pub fn longest(&self) -> Option<&Streak> {
        self.streaks.values().min_by_key(|streak| streak.since)
    }

    /// 用户要求立即重试：清除放慢探测，被拒轮次从头计算。仍被拒时要再连续被拒
    /// 几轮才重新放慢。从什么时候起、被拒了几次照旧保留，告警里的说明不受影响。
    pub fn reset_protection(&mut self) {
        for streak in self.streaks.values_mut() {
            streak.resume_at = None;
            streak.rounds = 0;
        }
    }

    /// 只保留仍在监控的站点，删掉的地区不再出现在告警里。
    pub fn retain_sites(&mut self, sites: &HashSet<String>) {
        self.streaks.retain(|site, _| sites.contains(site));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SITE: &str = "www.apple.com.cn";

    fn reject(backoff: &mut ExitBackoff, cycle: u64, now: Instant) -> Option<Duration> {
        backoff.reject(SITE, "系统代理".into(), cycle, true, now, SystemTime::now())
    }

    #[test]
    fn 前两轮被拒仍按用户间隔_第三轮起放慢探测() {
        let now = Instant::now();
        let mut backoff = ExitBackoff::default();
        assert_eq!(reject(&mut backoff, 1, now), None);
        assert_eq!(reject(&mut backoff, 2, now), None);
        assert_eq!(backoff.wait_for(SITE, now), None);
        assert_eq!(reject(&mut backoff, 3, now), Some(PROBE_STEPS[0]));
        assert_eq!(backoff.wait_for(SITE, now), Some(PROBE_STEPS[0]));
        assert_eq!(backoff.wait_for(SITE, now + PROBE_STEPS[0]), None);
    }

    #[test]
    fn 同一轮多次被拒只算一轮但都计入被拒次数() {
        let now = Instant::now();
        let mut backoff = ExitBackoff::default();
        reject(&mut backoff, 1, now);
        reject(&mut backoff, 1, now);
        reject(&mut backoff, 2, now);
        assert_eq!(reject(&mut backoff, 2, now), None, "同一轮不能升档");
        assert_eq!(backoff.streak(SITE).unwrap().rejections, 4);
        assert_eq!(reject(&mut backoff, 3, now), Some(PROBE_STEPS[0]));
    }

    #[test]
    fn 探测仍被拒时逐级延长并封顶() {
        let mut at = Instant::now();
        let mut backoff = ExitBackoff::default();
        for cycle in 1..SLOW_DOWN_AFTER_ROUNDS as u64 {
            reject(&mut backoff, cycle, at);
        }
        let mut cycle = SLOW_DOWN_AFTER_ROUNDS as u64;
        for step in PROBE_STEPS {
            assert_eq!(reject(&mut backoff, cycle, at), Some(step));
            at += step;
            cycle += 1;
        }
        assert_eq!(
            reject(&mut backoff, cycle, at),
            Some(PROBE_STEPS[PROBE_STEPS.len() - 1])
        );
    }

    #[test]
    fn 成功一次清除记录并从头计数() {
        let now = Instant::now();
        let mut backoff = ExitBackoff::default();
        for cycle in 1..=3 {
            reject(&mut backoff, cycle, now);
        }
        assert!(backoff.succeed(SITE));
        assert_eq!(backoff.wait_for(SITE, now), None);
        assert!(backoff.streak(SITE).is_none());
        assert!(!backoff.succeed(SITE), "没有被拒过时不算恢复");
        assert_eq!(reject(&mut backoff, 4, now), None, "重新被拒从第一轮算起");
    }

    #[test]
    fn 立即重试清除放慢并从头计算被拒轮次() {
        let now = Instant::now();
        let mut backoff = ExitBackoff::default();
        for cycle in 1..=4 {
            reject(&mut backoff, cycle, now);
        }
        let since = backoff.streak(SITE).unwrap().since;
        backoff.reset_protection();
        assert_eq!(backoff.wait_for(SITE, now), None);
        assert_eq!(reject(&mut backoff, 5, now), None, "清除后第一次被拒不放慢");
        assert_eq!(reject(&mut backoff, 6, now), None);
        assert_eq!(
            reject(&mut backoff, 7, now),
            Some(PROBE_STEPS[0]),
            "重新连续被拒三轮后从第一档开始放慢"
        );
        let streak = backoff.streak(SITE).unwrap();
        assert_eq!(streak.since, since, "被拒的起始时间照旧保留");
        assert_eq!(streak.rejections, 7);
    }

    #[test]
    fn 有别的出口可换时只记账不放慢() {
        let now = Instant::now();
        let mut backoff = ExitBackoff::default();
        for cycle in 1..=5 {
            let wait = backoff.reject(
                SITE,
                format!("Clash 节点 香港0{cycle}"),
                cycle,
                false,
                now,
                SystemTime::now(),
            );
            assert_eq!(wait, None);
        }
        assert_eq!(backoff.wait_for(SITE, now), None);
        let streak = backoff.streak(SITE).unwrap();
        assert_eq!(streak.rejections, 5);
        assert_eq!(streak.route, "Clash 节点 香港05", "记下最近一次被拒的出口");
    }

    #[test]
    fn 界面取被拒最久的站点且删掉的地区不再保留() {
        let now = Instant::now();
        let earlier = SystemTime::now() - Duration::from_secs(600);
        let mut backoff = ExitBackoff::default();
        backoff.reject(SITE, "系统代理".into(), 1, true, now, SystemTime::now());
        backoff.reject("www.apple.com", "系统代理".into(), 1, true, now, earlier);
        assert_eq!(backoff.longest().unwrap().since, earlier);

        backoff.retain_sites(&HashSet::from([SITE.to_string()]));
        assert!(backoff.streak("www.apple.com").is_none());
        assert!(backoff.streak(SITE).is_some());
    }
}
