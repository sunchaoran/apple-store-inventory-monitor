//! 到货历史：每段连续有货结束后留一条记录，重启应用后仍能看到什么时候来过货。
//!
//! 和设置放在同一个目录，同样整份原子写入。它只是历史，读不出来时当作没有记录，
//! 不能因此让监控起不来。

use std::fs::File;
use std::path::{Path, PathBuf};

use crate::config::{APP_DIR, ConfigError, read_capped, write_atomically};
use crate::watcher::SightingRecord;

/// 最多保留的记录条数。一天来几波货也够看好几周，文件不过几十 KB。
pub const MAX_RECORDS: usize = 200;

const HISTORY_FILE: &str = "stock-history.json";

/// 读取时接受的字节上限，远大于 [`MAX_RECORDS`] 条记录的实际大小。
const MAX_HISTORY_BYTES: usize = 1024 * 1024;

/// 到货历史文件。
pub struct SightingLog {
    path: PathBuf,
}

impl SightingLog {
    /// 指向系统用户配置目录下的历史文件。只算路径，第一次写入时才建目录。
    pub fn new() -> Result<Self, ConfigError> {
        let dir = dirs::config_dir().ok_or(ConfigError::NoConfigDir)?;
        Ok(Self::at(dir.join(APP_DIR).join(HISTORY_FILE)))
    }

    /// 指向任意路径，供测试使用。
    pub fn at(path: PathBuf) -> Self {
        Self { path }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    /// 读出全部记录，从旧到新。文件不存在、过大或内容损坏时返回空列表。
    pub fn load(&self) -> Vec<SightingRecord> {
        let Ok(file) = File::open(&self.path) else {
            return Vec::new();
        };
        let Ok(Some(data)) = read_capped(file, MAX_HISTORY_BYTES) else {
            return Vec::new();
        };
        serde_json::from_slice(&data).unwrap_or_default()
    }

    /// 追加一条记录并写盘，只保留最近 [`MAX_RECORDS`] 条。
    ///
    /// 写盘失败时内存里的列表照样更新，界面还能看到这次到货，只是重启后会丢。
    pub fn append(
        &self,
        records: &mut Vec<SightingRecord>,
        record: SightingRecord,
    ) -> Result<(), ConfigError> {
        records.push(record);
        let overflow = records.len().saturating_sub(MAX_RECORDS);
        records.drain(..overflow);
        let data =
            serde_json::to_vec(&*records).map_err(|source| ConfigError::Encode { source })?;
        write_atomically(&self.path, &data)
    }
}
