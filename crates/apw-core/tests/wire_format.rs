//! 跨 IPC 边界的线上格式契约。
//!
//! 这些用例钉住的是「Rust 序列化出来长什么样」。前端的 TypeScript 类型是照着
//! 这个形状手写的，一旦有人调整了 serde 标注，这里会立刻变红 —— 而不是等到
//! 界面上莫名其妙少了一列、或者状态永远显示不出来才发现。
//!
//! 尤其是 `Availability`：它是内部标签枚举套内部标签枚举，会扁平成两层判别字段
//! （`kind` + `reason`）。这个形状正好能映射成 TypeScript 的可辨识联合，配合
//! `switch` 的穷尽性检查，Rust 这边加一个状态、前端漏处理就编译不过。这是刻意
//! 设计的，不是巧合，所以必须钉住。

use apw_core::apple::BlockedRoute;
use apw_core::config::OpenOnHit;
use apw_core::model::{Availability, Category, Product, Store, Target, UnknownReason};
use apw_core::watcher::{Event, Sighting, SightingRecord, TroubleAdvice};
use serde_json::json;

fn to_value<T: serde::Serialize>(v: &T) -> serde_json::Value {
    serde_json::to_value(v).expect("序列化失败")
}

#[test]
fn 到货跳转方式的线上格式是稳定字符串() {
    for (destination, want) in [
        (OpenOnHit::None, "none"),
        (OpenOnHit::Bag, "bag"),
        (OpenOnHit::EducationBag, "education_bag"),
        (OpenOnHit::Product, "product"),
    ] {
        assert_eq!(to_value(&destination), json!(want));
        let back: OpenOnHit =
            serde_json::from_value(json!(want)).expect("前端传回来的跳转方式必须认得");
        assert_eq!(back, destination);
    }
}

#[test]
fn 可用状态的线上格式() {
    assert_eq!(
        to_value(&Availability::InStock),
        json!({"kind": "in_stock"})
    );
    assert_eq!(
        to_value(&Availability::OutOfStock),
        json!({"kind": "out_of_stock"})
    );
}

#[test]
fn 未知状态会扁平成两层判别字段() {
    let cases: Vec<(UnknownReason, serde_json::Value)> = vec![
        (
            UnknownReason::BrowserUnavailable {
                detail: "资料目录无法取得锁".into(),
            },
            json!({"kind": "unknown", "reason": "browser_unavailable", "detail": "资料目录无法取得锁"}),
        ),
        (
            UnknownReason::NotYetChecked,
            json!({"kind": "unknown", "reason": "not_yet_checked"}),
        ),
        (
            UnknownReason::PickupPending,
            json!({"kind": "unknown", "reason": "pickup_pending"}),
        ),
        (
            UnknownReason::Blocked {
                detail: "HTTP 541".into(),
            },
            json!({"kind": "unknown", "reason": "blocked", "detail": "HTTP 541"}),
        ),
        (
            UnknownReason::RateLimited,
            json!({"kind": "unknown", "reason": "rate_limited"}),
        ),
        (
            UnknownReason::CoolingDown {
                remaining_seconds: 299,
                detail: "HTTP 541".into(),
            },
            json!({"kind": "unknown", "reason": "cooling_down", "remaining_seconds": 299, "detail": "HTTP 541"}),
        ),
        (
            UnknownReason::SchemaDrift {
                field: "pickupDisplay".into(),
                raw: "weird".into(),
            },
            json!({"kind": "unknown", "reason": "schema_drift", "field": "pickupDisplay", "raw": "weird"}),
        ),
        (
            UnknownReason::StorePickupUnavailable {
                store_number: "R384".into(),
            },
            json!({"kind": "unknown", "reason": "store_pickup_unavailable", "store_number": "R384"}),
        ),
        (
            UnknownReason::AppleError {
                message: "boom".into(),
            },
            json!({"kind": "unknown", "reason": "apple_error", "message": "boom"}),
        ),
        (
            UnknownReason::Transport {
                detail: "timeout".into(),
            },
            json!({"kind": "unknown", "reason": "transport", "detail": "timeout"}),
        ),
    ];

    for (reason, want) in cases {
        assert_eq!(
            to_value(&Availability::Unknown(reason.clone())),
            want,
            "{reason:?} 的线上格式变了，前端的 TypeScript 类型需要同步更新"
        );
    }
}

#[test]
fn 跨边界的结构统一用小驼峰() {
    // 混用 snake_case 和 camelCase 会让前端每个类型都要单独记住用哪种，
    // 迟早写错。统一成小驼峰，符合 TypeScript 的习惯。
    let target = Target {
        locale: "zh_CN".into(),
        store_number: "R683".into(),
        store_title: "上海-环球港".into(),
        part_number: "MG724CH/A".into(),
        product_name: "iPhone 17 512GB 黑色".into(),
        companion_part: None,
        companion_name: None,
        kit_part: None,
        pickup_location: None,
    };
    assert_eq!(
        to_value(&target),
        json!({
            "locale": "zh_CN",
            "storeNumber": "R683",
            "storeTitle": "上海-环球港",
            "partNumber": "MG724CH/A",
            "productName": "iPhone 17 512GB 黑色"
        })
    );

    let product = Product {
        part_number: "MG724CH/A".into(),
        category: Category::Iphone,
        family: "iphone17".into(),
        capacity: "512GB".into(),
        color: "黑色".into(),
        title: "iPhone 17 512GB 黑色".into(),
        companion_part: None,
        kit_part: None,
        watch_case_size: None,
    };
    let v = to_value(&product);
    assert!(v.get("partNumber").is_some(), "Product 应当用小驼峰：{v}");
    // 品类是个纯字符串标签，前端照着它筛下拉框。写成对象或者数字，
    // TypeScript 那边的联合类型就对不上了。
    assert_eq!(v.get("category"), Some(&json!("iphone")));

    let store = Store {
        number: "R683".into(),
        name: "环球港".into(),
        title: "上海-环球港".into(),
        city: "上海".into(),
        state: "上海".into(),
        postal_code: "200062".into(),
        address: "上海市普陀区中山北路 3300 号".into(),
    };
    let value = to_value(&store);
    assert!(value.get("number").is_some());
    assert!(value.get("address").is_none());
}

#[test]
fn 品类的线上格式是小写标识符() {
    // 前端的 Category 联合类型逐字写着这四个串。谁改了 Rust 的 serde 标注，
    // 这里会先红，而不是等界面上品类下拉框选完什么都筛不出来才发现。
    for (category, want) in [
        (Category::Iphone, "iphone"),
        (Category::Ipad, "ipad"),
        (Category::Mac, "mac"),
        (Category::Watch, "watch"),
    ] {
        assert_eq!(to_value(&category), json!(want));
        let back: Category = serde_json::from_value(json!(want)).expect("前端传回来的品类必须认得");
        assert_eq!(back, category);
    }
}

#[test]
fn 故障建议的线上格式是小写标识符() {
    // 前端的 TroubleAdvice 联合类型逐字写着这两个串，而界面正是靠它决定要不要
    // 把「换条网络试试」那句话摆出来。对不上的话，用户看到的还是一句干巴巴的
    // 「请求被 Apple 拦截」，不知道自己其实有得可做 —— 而这条提示存在的全部
    // 理由就是让他知道。
    for (advice, want) in [
        (TroubleAdvice::TryAnotherNetwork, "try_another_network"),
        (TroubleAdvice::WaitForRetry, "wait_for_retry"),
        (TroubleAdvice::WaitForUpdate, "wait_for_update"),
        (TroubleAdvice::CheckProduct, "check_product"),
    ] {
        assert_eq!(to_value(&advice), json!(want));
    }

    // 没有建议时必须是 null，不能是缺字段 —— 前端按 `advice !== null` 判断。
    let event = Event::Trouble {
        reason: "门店 R683 查询失败".into(),
        advice: None,
    };
    let v = to_value(&event);
    assert_eq!(v.get("advice"), Some(&serde_json::Value::Null));
    assert_eq!(v.get("type").and_then(|t| t.as_str()), Some("trouble"));
}

#[test]
fn 轮询事件携带前端可用的轮次与耗时() {
    let started = to_value(&Event::CycleStarted {
        cycle: 2,
        store_count: 1,
        target_count: 3,
    });
    assert_eq!(started.get("type"), Some(&json!("cycleStarted")));
    assert_eq!(started.get("cycle"), Some(&json!(2)));
    assert_eq!(started.get("storeCount"), Some(&json!(1)));
    assert_eq!(started.get("targetCount"), Some(&json!(3)));
    assert!(started.get("store_count").is_none());

    let completed = to_value(&Event::CycleComplete {
        cycle: 2,
        elapsed_ms: 2_150,
        request_count: 1,
        reused_response_count: 2,
        next_check_in_secs: 60,
        cooling: true,
        aligned_check: false,
        route: Some("Clash 节点 香港01".into()),
        blocked: Some(BlockedRoute {
            route: "系统代理 127.0.0.1:6152".into(),
            since_ms: 1_700_000_000_000,
            rejections: 3,
        }),
        healthy: true,
        snapshot: Vec::new(),
    });
    assert_eq!(completed.get("type"), Some(&json!("cycleComplete")));
    assert_eq!(completed.get("cycle"), Some(&json!(2)));
    assert_eq!(completed.get("elapsedMs"), Some(&json!(2_150)));
    assert_eq!(completed.get("requestCount"), Some(&json!(1)));
    assert_eq!(completed.get("reusedResponseCount"), Some(&json!(2)));
    assert_eq!(completed.get("nextCheckInSecs"), Some(&json!(60)));
    assert_eq!(completed.get("route"), Some(&json!("Clash 节点 香港01")));
    assert_eq!(completed.get("cooling"), Some(&json!(true)));
    assert_eq!(
        completed.get("blocked"),
        Some(&json!({
            "route": "系统代理 127.0.0.1:6152",
            "sinceMs": 1_700_000_000_000u64,
            "rejections": 3
        }))
    );
    assert!(completed.get("elapsed_ms").is_none());

    // 没有出口被拒时整个字段省略，前端据此收起说明。
    let healthy = to_value(&Event::CycleComplete {
        cycle: 3,
        elapsed_ms: 900,
        request_count: 1,
        reused_response_count: 0,
        next_check_in_secs: 12,
        cooling: false,
        aligned_check: true,
        route: None,
        blocked: None,
        healthy: true,
        snapshot: Vec::new(),
    });
    assert!(healthy.get("blocked").is_none());
    assert!(healthy.get("route").is_none());
    assert_eq!(healthy.get("alignedCheck"), Some(&json!(true)));
    assert!(healthy.get("aligned_check").is_none());
}

#[test]
fn 监控目标能原样往返() {
    // 前端会把 Target 发回来（set_targets），所以它必须是可往返的。
    let target = Target {
        locale: "ja_JP".into(),
        store_number: "R119".into(),
        store_title: "東京-渋谷".into(),
        part_number: "MG6A4J/A".into(),
        product_name: "iPhone 17 256GB ラベンダー".into(),
        companion_part: None,
        companion_name: None,
        kit_part: None,
        pickup_location: None,
    };
    let json = serde_json::to_string(&target).unwrap();
    let back: Target = serde_json::from_str(&json).expect("反序列化失败");
    assert_eq!(target, back);
}

#[test]
fn 暂无取货数据保留未知类型并提示核对商品() {
    assert_eq!(
        to_value(&Availability::Unknown(UnknownReason::NoPickupData {
            store_number: "R581".into()
        })),
        json!({"kind":"unknown","reason":"no_pickup_data","store_number":"R581"})
    );
    assert_eq!(
        to_value(&TroubleAdvice::CheckProduct),
        json!("check_product")
    );
}

#[test]
fn 缺失型号与业务说明的前端协议稳定() {
    assert_eq!(
        to_value(&Availability::Unknown(UnknownReason::ProductNotReturned {
            part_number: "OLD/A".into()
        })),
        json!({"kind":"unknown","reason":"product_not_returned","part_number":"OLD/A"})
    );
    let detail = apw_core::model::PickupDetails {
        pickup_display: "ineligible".into(),
        pickup_quote: Some("暂不提供取货".into()),
        sale_reason: Some("NOT_FOR_SALE".into()),
        sale_message: Some("暂未发售".into()),
    };
    assert_eq!(
        to_value(&detail),
        json!({"pickupDisplay":"ineligible","pickupQuote":"暂不提供取货","saleReason":"NOT_FOR_SALE","saleMessage":"暂未发售"})
    );
}

#[test]
fn 到货记录的线上格式() {
    let record = SightingRecord {
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
            since_ms: 1_000,
            last_seen_ms: 61_000,
            ended_ms: None,
            interrupted: false,
            rounds: 3,
            pickup_quote: Some("今天可取货".into()),
        },
    };
    // 还在有货：没有结束时间，也不带 interrupted。
    assert_eq!(
        to_value(&record.sighting),
        json!({"sinceMs": 1_000, "lastSeenMs": 61_000, "rounds": 3, "pickupQuote": "今天可取货"})
    );
    let paused = Sighting {
        ended_ms: Some(90_000),
        interrupted: true,
        pickup_quote: None,
        ..record.sighting.clone()
    };
    assert_eq!(
        to_value(&paused),
        json!({"sinceMs": 1_000, "lastSeenMs": 61_000, "endedMs": 90_000, "interrupted": true, "rounds": 3})
    );

    let event = to_value(&Event::SightingEnded(record.clone()));
    assert_eq!(event["type"], "sightingEnded");
    assert_eq!(event["target"]["storeNumber"], "R359");
    assert_eq!(event["sighting"]["sinceMs"], 1_000);

    // 宿主把记录原样写进历史文件，必须能读回来。
    let back: SightingRecord = serde_json::from_value(to_value(&record)).expect("历史记录读不回来");
    assert_eq!(back, record);
}
