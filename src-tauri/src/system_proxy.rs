//! 读取系统代理设置，只用来告诉用户「跟随系统代理」时请求交给了谁。
//!
//! 这种模式下查询浏览器不带代理参数，出口由系统设置和代理软件的规则决定。被
//! Apple 拒绝时只说「系统代理」，用户分不清是直连、Surge 还是别的代理软件；写出
//! 代理地址，他至少知道该去哪个软件里查规则。读不到时退回「系统代理」，不影响查询。

use std::time::Duration;

/// 访问 Apple 时系统代理的走向。Apple 的页面和接口都是 HTTPS，只看 HTTPS 的设置。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SystemProxy {
    /// 手动设置的代理，例如 `127.0.0.1:6152`、`SOCKS 127.0.0.1:6153`。
    Server(String),
    /// 自动代理配置（PAC 脚本或自动发现），具体走向由脚本决定。
    Automatic,
    /// 没有为 HTTPS 设置代理。
    Unset,
}

impl SystemProxy {
    pub fn label(&self) -> String {
        match self {
            Self::Server(server) => format!("系统代理 {server}"),
            Self::Automatic => "系统代理（自动配置）".into(),
            // TUN 类代理不设置系统代理也能接管流量，所以不说成「直连」。
            Self::Unset => "系统网络（未设置代理）".into(),
        }
    }
}

/// 用于展示的出口说明；读不到系统设置时只说「系统代理」。
pub async fn label() -> String {
    let read = tokio::task::spawn_blocking(read_settings);
    match tokio::time::timeout(Duration::from_secs(2), read).await {
        Ok(Ok(Some(proxy))) => proxy.label(),
        _ => "系统代理".into(),
    }
}

#[cfg(target_os = "macos")]
fn read_settings() -> Option<SystemProxy> {
    let output = std::process::Command::new("/usr/sbin/scutil")
        .arg("--proxy")
        .output()
        .ok()?;
    output
        .status
        .success()
        .then(|| parse_scutil(&String::from_utf8_lossy(&output.stdout)))
}

#[cfg(windows)]
fn read_settings() -> Option<SystemProxy> {
    use std::os::windows::process::CommandExt;

    let output = std::process::Command::new("reg")
        .args([
            "query",
            r"HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings",
        ])
        .creation_flags(windows_sys::Win32::System::Threading::CREATE_NO_WINDOW)
        .output()
        .ok()?;
    output
        .status
        .success()
        .then(|| parse_reg_query(&String::from_utf8_lossy(&output.stdout)))
}

#[cfg(not(any(target_os = "macos", windows)))]
fn read_settings() -> Option<SystemProxy> {
    None
}

/// 解析 `scutil --proxy` 的输出。
///
/// 只认最外层字典：`__SCOPED__` 下面按网卡重复列出同名字段。取舍与 Chromium 在
/// macOS 上一致：自动发现或 PAC 优先，其次 HTTPS 代理，最后 SOCKS。
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn parse_scutil(output: &str) -> SystemProxy {
    let mut fields = std::collections::HashMap::new();
    let mut depth = 0usize;
    for line in output.lines().map(str::trim) {
        if line == "}" {
            depth = depth.saturating_sub(1);
            continue;
        }
        if depth == 1
            && let Some((key, value)) = line.split_once(" : ")
        {
            fields.insert(key, value);
        }
        if line.ends_with('{') {
            depth += 1;
        }
    }
    let enabled = |key: &str| fields.get(key).is_some_and(|value| *value == "1");
    let server = |host: &str, port: &str| {
        let host = fields.get(host).filter(|host| !host.is_empty())?;
        Some(match fields.get(port) {
            Some(port) => format!("{host}:{port}"),
            None => host.to_string(),
        })
    };
    if enabled("ProxyAutoDiscoveryEnable") || enabled("ProxyAutoConfigEnable") {
        return SystemProxy::Automatic;
    }
    if enabled("HTTPSEnable")
        && let Some(server) = server("HTTPSProxy", "HTTPSPort")
    {
        return SystemProxy::Server(server);
    }
    if enabled("SOCKSEnable")
        && let Some(server) = server("SOCKSProxy", "SOCKSPort")
    {
        return SystemProxy::Server(format!("SOCKS {server}"));
    }
    SystemProxy::Unset
}

/// 解析 `reg query` 列出的 Internet Settings。
///
/// Chromium 在 Windows 上沿用这里的设置：有 PAC 地址时按脚本走；否则打开了
/// ProxyEnable 才用 ProxyServer。它可能是对所有协议生效的单个地址，也可能是
/// `http=…;https=…;socks=…`，HTTPS 请求依次取 https 和 socks。
#[cfg_attr(not(windows), allow(dead_code))]
fn parse_reg_query(output: &str) -> SystemProxy {
    let mut fields = std::collections::HashMap::new();
    for line in output.lines() {
        let mut parts = line.split_whitespace();
        let (Some(name), Some(kind)) = (parts.next(), parts.next()) else {
            continue;
        };
        if kind.starts_with("REG_") {
            fields.insert(name, parts.collect::<Vec<_>>().join(" "));
        }
    }
    if fields
        .get("AutoConfigURL")
        .is_some_and(|url| !url.is_empty())
    {
        return SystemProxy::Automatic;
    }
    let enabled = fields.get("ProxyEnable").is_some_and(|value| {
        u32::from_str_radix(value.trim_start_matches("0x"), 16).is_ok_and(|value| value != 0)
    });
    let Some(server) = fields
        .get("ProxyServer")
        .filter(|server| enabled && !server.is_empty())
    else {
        return SystemProxy::Unset;
    };
    if !server.contains('=') {
        return SystemProxy::Server(server.clone());
    }
    let rules: std::collections::HashMap<&str, &str> = server
        .split(';')
        .filter_map(|rule| rule.split_once('='))
        .map(|(scheme, address)| (scheme.trim(), address.trim()))
        .filter(|(_, address)| !address.is_empty())
        .collect();
    if let Some(https) = rules.get("https") {
        SystemProxy::Server(https.to_string())
    } else if let Some(socks) = rules.get("socks") {
        SystemProxy::Server(format!("SOCKS {socks}"))
    } else {
        SystemProxy::Unset
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SURGE: &str = "<dictionary> {
  ExceptionsList : <array> {
    0 : 127.0.0.1
    1 : localhost
  }
  FTPPassive : 1
  HTTPEnable : 1
  HTTPPort : 6152
  HTTPProxy : 127.0.0.1
  HTTPSEnable : 1
  HTTPSPort : 6152
  HTTPSProxy : 127.0.0.1
  SOCKSEnable : 1
  SOCKSPort : 6153
  SOCKSProxy : 127.0.0.1
  __SCOPED__ : <dictionary> {
    en0 : <dictionary> {
      HTTPSEnable : 0
      ProxyAutoConfigEnable : 1
    }
  }
}
";

    #[test]
    fn macos优先取https代理且忽略按网卡列出的字段() {
        assert_eq!(
            parse_scutil(SURGE),
            SystemProxy::Server("127.0.0.1:6152".into())
        );
    }

    #[test]
    fn macos只开socks或pac时如实说明() {
        let socks = "<dictionary> {\n  HTTPSEnable : 0\n  SOCKSEnable : 1\n  SOCKSPort : 7891\n  SOCKSProxy : 127.0.0.1\n}\n";
        assert_eq!(
            parse_scutil(socks),
            SystemProxy::Server("SOCKS 127.0.0.1:7891".into())
        );
        let pac = "<dictionary> {\n  HTTPSEnable : 1\n  HTTPSPort : 7890\n  HTTPSProxy : 127.0.0.1\n  ProxyAutoConfigEnable : 1\n  ProxyAutoConfigURLString : http://127.0.0.1:33331/pac\n}\n";
        assert_eq!(parse_scutil(pac), SystemProxy::Automatic);
        let none = "<dictionary> {\n  HTTPEnable : 0\n  HTTPSEnable : 0\n}\n";
        assert_eq!(parse_scutil(none), SystemProxy::Unset);
    }

    #[test]
    fn windows读取统一地址或按协议分开的地址() {
        let all = "
HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings
    ProxyEnable    REG_DWORD    0x1
    ProxyServer    REG_SZ    127.0.0.1:7890
    ProxyOverride    REG_SZ    localhost;127.*
";
        assert_eq!(
            parse_reg_query(all),
            SystemProxy::Server("127.0.0.1:7890".into())
        );
        let split = "    ProxyEnable    REG_DWORD    0x1\n    ProxyServer    REG_SZ    http=127.0.0.1:7890;socks=127.0.0.1:7891\n";
        assert_eq!(
            parse_reg_query(split),
            SystemProxy::Server("SOCKS 127.0.0.1:7891".into())
        );
        let http_only = "    ProxyEnable    REG_DWORD    0x1\n    ProxyServer    REG_SZ    http=127.0.0.1:7890\n";
        assert_eq!(parse_reg_query(http_only), SystemProxy::Unset);
    }

    #[test]
    fn windows关闭代理或使用pac时如实说明() {
        let disabled =
            "    ProxyEnable    REG_DWORD    0x0\n    ProxyServer    REG_SZ    127.0.0.1:7890\n";
        assert_eq!(parse_reg_query(disabled), SystemProxy::Unset);
        let pac = "    ProxyEnable    REG_DWORD    0x0\n    AutoConfigURL    REG_SZ    http://127.0.0.1:33331/pac\n";
        assert_eq!(parse_reg_query(pac), SystemProxy::Automatic);
    }

    #[test]
    fn 出口说明区分代理地址自动配置和未设置() {
        assert_eq!(
            SystemProxy::Server("127.0.0.1:6152".into()).label(),
            "系统代理 127.0.0.1:6152"
        );
        assert_eq!(SystemProxy::Automatic.label(), "系统代理（自动配置）");
        assert_eq!(SystemProxy::Unset.label(), "系统网络（未设置代理）");
    }
}
