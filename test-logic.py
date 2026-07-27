"""
验证 gist-sync 模块的核心算法逻辑（Python 等价测试）
运行: python test-logic.py
"""
from datetime import datetime, timedelta

passed = 0
failed = 0

def assert_eq(condition, msg):
    global passed, failed
    if condition:
        passed += 1
        print(f"  [PASS] {msg}")
    else:
        failed += 1
        print(f"  [FAIL] {msg}")

def days_ago(n):
    return (datetime.now() - timedelta(days=n)).strftime("%Y-%m-%d")

today = datetime.now().strftime("%Y-%m-%d")

# ==================== Test 1: 14天过滤 ====================
print("\n=== Test 1: filterLast14Days ===")

cutoff = (datetime.now() - timedelta(days=14)).strftime("%Y-%m-%d")

records = [
    {"client_id": "r1", "date": today},
    {"client_id": "r2", "date": days_ago(7)},
    {"client_id": "r3", "date": days_ago(13)},
    {"client_id": "r4", "date": days_ago(14)},
    {"client_id": "r5", "date": days_ago(15)},
    {"client_id": "r6", "date": days_ago(30)},
    {"client_id": "r7", "date": None},  # 无日期兜底保留
]

# 模拟 JS 的 filterLast14Days 逻辑
filtered = [r for r in records if r["date"] is None or r["date"] >= cutoff]

assert_eq(len(filtered) == 5, f"过滤后应为5条, 实际 {len(filtered)}")
assert_eq(any(r["client_id"] == "r1" for r in filtered), "今天保留")
assert_eq(any(r["client_id"] == "r3" for r in filtered), "13天前保留")
assert_eq(not any(r["client_id"] == "r5" for r in filtered), "15天前移除")
assert_eq(not any(r["client_id"] == "r6" for r in filtered), "30天前移除")
assert_eq(any(r["client_id"] == "r7" for r in filtered), "无日期兜底保留")

# ==================== Test 2: 合并算法 ====================
print("\n=== Test 2: mergeRecords (Last-Write-Wins) ===")

local_arr = [
    {"client_id": "a", "title": "local-new", "updated_at": "2026-07-28T10:00:00Z"},
    {"client_id": "b", "title": "local-old", "updated_at": "2026-07-20T08:00:00Z"},
    {"client_id": "c", "title": "local-only", "updated_at": "2026-07-28T09:00:00Z"},
]

remote_arr = [
    {"client_id": "a", "title": "remote-old", "updated_at": "2026-07-27T10:00:00Z"},
    {"client_id": "b", "title": "remote-new", "updated_at": "2026-07-25T12:00:00Z"},
    {"client_id": "d", "title": "remote-only", "updated_at": "2026-07-26T10:00:00Z"},
]

# 模拟 JS mergeRecords 逻辑
merged = {}
stats = {"local_only": 0, "updated_local": 0, "updated_remote": 0, "same": 0}

for r in remote_arr:
    merged[r["client_id"]] = r

for l in local_arr:
    cid = l["client_id"]
    if cid not in merged:
        merged[cid] = l
        stats["local_only"] += 1
    else:
        lt = datetime.fromisoformat(l["updated_at"].replace("Z", "+00:00"))
        rt = datetime.fromisoformat(merged[cid]["updated_at"].replace("Z", "+00:00"))
        if lt > rt:
            merged[cid] = l
            stats["updated_local"] += 1
        elif rt > lt:
            stats["updated_remote"] += 1
        else:
            stats["same"] += 1

merged_list = list(merged.values())

assert_eq(len(merged_list) == 4, f"合并后应为4条, 实际 {len(merged_list)}")
assert_eq(merged["a"]["title"] == "local-new", "a: 本地更新赢")
assert_eq(merged["b"]["title"] == "remote-new", "b: 云端更新赢")
assert_eq(merged["c"]["title"] == "local-only", "c: 本地独有保留")
assert_eq(merged["d"]["title"] == "remote-only", "d: 云端独有保留")
assert_eq(stats["local_only"] == 1, "local_only = 1")
assert_eq(stats["updated_local"] == 1, "updated_local = 1")
assert_eq(stats["updated_remote"] == 1, "updated_remote = 1")

# ==================== Test 3: 安全清理 ====================
print("\n=== Test 3: safeCleanLocalData ===")

last_sync = "2026-07-15T00:00:00Z"
sessions = [
    {"client_id": "s1", "date": today, "updated_at": "2026-07-28T10:00:00Z"},
    {"client_id": "s2", "date": days_ago(20), "updated_at": "2026-07-01T10:00:00Z"},  # 旧+已同步→删
    {"client_id": "s3", "date": days_ago(20), "updated_at": "2026-07-27T10:00:00Z"},  # 旧+未同步→留
]

kept = []
removed = 0
kept_unsafe = 0

for s in sessions:
    if s["date"] >= cutoff:
        kept.append(s)
    else:
        # 检查是否已同步
        s_time = datetime.fromisoformat(s["updated_at"].replace("Z", "+00:00"))
        sync_time = datetime.fromisoformat(last_sync.replace("Z", "+00:00"))
        if s_time > sync_time:
            kept.append(s)
            kept_unsafe += 1
        else:
            removed += 1

assert_eq(len(kept) == 2, f"清理后应保留2条, 实际 {len(kept)}")
assert_eq(removed == 1, f"应删除1条, 实际 {removed}")
assert_eq(kept_unsafe == 1, f"应保留1条未同步, 实际 {kept_unsafe}")

# ==================== 结果 ====================
print(f"\n{'=' * 40}")
print(f"Results: {passed} passed, {failed} failed")
if failed == 0:
    print("[OK] All logic tests passed!")
else:
    exit(1)
