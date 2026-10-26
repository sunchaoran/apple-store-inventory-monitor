//! 到货历史文件。

use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use apw_core::history::{MAX_RECORDS, SightingLog};
use apw_core::model::Target;
use apw_core::watcher::{Sighting, SightingRecord};

/// 用完自动删掉的临时目录，做法与设置文件的测试相同。
struct 临时目录(PathBuf);

impl 临时目录 {
    fn new() -> Self {
        static SEQ: AtomicU64 = AtomicU64::new(0);
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |d| d.as_nanos());
        let path = std::env::temp_dir().join(format!(
            "apw-history-{}-{nanos}-{}",
            std::process::id(),
            SEQ.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&path).expect("创建临时目录失败");
        Self(path)
    }
}

impl Drop for 临时目录 {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn 记录(since_ms: u64) -> SightingRecord {
    SightingRecord {
        target: Target {
            locale: "zh_CN".into(),
            store_number: "R359".into(),
            store_title: "南京东路".into(),
            part_number: "MG6W4CH/A".into(),
            product_name: "iPhone 17 256GB 黑色".into(),
            companion_part: None,
            companion_name: None,
            kit_part: None,
            pickup_location: None,
        },
        sighting: Sighting {
            since_ms,
            last_seen_ms: since_ms + 30_000,
            ended_ms: Some(since_ms + 60_000),
            interrupted: false,
            rounds: 2,
            pickup_quote: None,
        },
    }
}

#[test]
fn 到货历史写入后能读回_只保留最近两百条() {
    let dir = 临时目录::new();
    let log = SightingLog::at(dir.0.join("nested").join("stock-history.json"));
    assert!(log.load().is_empty(), "还没有文件时就是没有记录");

    let mut records = Vec::new();
    for since in 0..(MAX_RECORDS as u64 + 5) {
        log.append(&mut records, 记录(since)).expect("写入失败");
    }
    assert_eq!(records.len(), MAX_RECORDS);
    assert_eq!(records[0].sighting.since_ms, 5, "最旧的几条被挤掉");
    assert_eq!(log.load(), records);
}

#[test]
fn 到货历史文件损坏时当作没有记录_下次写入覆盖() {
    let dir = 临时目录::new();
    let path = dir.0.join("stock-history.json");
    fs::write(&path, b"{not json").unwrap();
    let log = SightingLog::at(path);
    assert!(log.load().is_empty());

    let mut records = log.load();
    log.append(&mut records, 记录(42)).expect("写入失败");
    assert_eq!(log.load(), vec![记录(42)]);
}
