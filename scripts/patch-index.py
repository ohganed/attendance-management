#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


def patch_index(text: str) -> str:
    # 1) Guard against silently replacing the recovery key that protects old backups.
    old_key_handler = "onChange:async e=>{let t=e.target.files?.[0];if(t)try{await fw(Tw(await t.text())),alert(`復元キーをこの端末に登録しました`)}catch{alert(`正しい復元キーファイルを選んでください`)}finally{e.target.value=``}}}"
    new_key_handler = "onChange:async e=>{let t=e.target.files?.[0];if(t)try{let n=Tw(await t.text()),r=await dw();if(r&&!(r.length===n.length&&r.every((e,t)=>e===n[t]))&&!confirm(`現在の復元キーを置き換えます。古いバックアップの復元には現在のキーが必要です。現在の復元キーを別の場所に保存済みの場合だけ続行してください。置き換えますか？`))return;await fw(n),alert(`復元キーをこの端末に登録しました`)}catch{alert(`正しい復元キーファイルを選んでください`)}finally{e.target.value=``}}}"
    text = replace_once(text, old_key_handler, new_key_handler, "recovery-key overwrite guard")

    # 2) Persist restored state before the UI reports success.
    old_restore = "else throw Error(`暗号化されていないファイルです`);t(sw(i)),alert(`バックアップを復元しました`)"
    new_restore = "else throw Error(`暗号化されていないファイルです`);let a=sw(i);await uw(a),t(a),alert(`バックアップを復元しました`)"
    text = replace_once(text, old_restore, new_restore, "restore persistence")

    # 3) Keep Monthly Summary on the existing month-keyed map, but build Student
    # Summary independently without a month key so one student is one row.
    old_summary = "s(`Student Summary`,Array.from(a.values())),s(`Monthly Summary`,Array.from(a.values()))"
    new_summary = "s(`Student Summary`,(()=>{let e=new Map;return i.filter(e=>e.集計対象===`対象`).forEach(t=>{let n=`${t.学校}|${t.クラス}|${t.出席番号}`,r=e.get(n)||{学校:t.学校,クラス:t.クラス,出席番号:t.出席番号,欠席:0,遅刻:0,早退:0,認欠:0,忌引:0};r[t.区分]=(r[t.区分]||0)+1,e.set(n,r)}),Array.from(e.values())})()),s(`Monthly Summary`,Array.from(a.values()))"
    text = replace_once(text, old_summary, new_summary, "Excel Student Summary aggregation")

    return text


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("path", nargs="?", default="index.html")
    parser.add_argument("--check", action="store_true", help="verify that all patches apply without writing")
    args = parser.parse_args()

    path = Path(args.path)
    original = path.read_text(encoding="utf-8")
    patched = patch_index(original)

    if args.check:
        print("PASS: all compiled-app safety patches matched exactly once")
        return

    path.write_text(patched, encoding="utf-8")
    print(f"Patched {path}")


if __name__ == "__main__":
    main()
