#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
from pathlib import Path


def replace_once(text: str, pattern: str, replacement: str, label: str) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return updated


def patch_index(text: str) -> str:
    # 1) Do not silently replace an existing recovery key. If the imported key is
    # different, warn that older backups still depend on the old key and require
    # explicit confirmation before overwriting it.
    text = replace_once(
        text,
        r"onChange:async e=>\{let t=e\.target\.files\?\.\[0\];if\(t\)try\{await fw\(Tw\(await t\.text\(\)\)\),alert\(`復元キーをこの端末に登録しました`\)\}catch\{alert\(`正しい復元キーファイルを選んでください`\)\}finally\{e\.target\.value=``\}\}\}\)\]\}\),\(0,Q\.jsxs\)\(`label`,\{className:`file`,children:\[`暗号化バックアップを復元`",
        "onChange:async e=>{let t=e.target.files?.[0];if(t)try{let n=Tw(await t.text()),r=await dw();if(r&&!(r.length===n.length&&r.every((e,t)=>e===n[t]))&&!confirm(`現在の復元キーを置き換えます。古いバックアップの復元には現在のキーが必要です。現在の復元キーを別の場所に保存済みの場合だけ続行してください。置き換えますか？`))return;await fw(n),alert(`復元キーをこの端末に登録しました`)}catch{alert(`正しい復元キーファイルを選んでください`)}finally{e.target.value=``}}})]}),(0,Q.jsxs)(`label`,{className:`file`,children:[`暗号化バックアップを復元`",
        "recovery-key overwrite guard",
    )

    # 2) Persist the restored state to IndexedDB before reporting success. React's
    # state update still runs afterwards, but the success message now means the
    # durable write has completed.
    text = replace_once(
        text,
        r"else throw Error\(`暗号化されていないファイルです`\);t\(sw\(i\)\),alert\(`バックアップを復元しました`\)",
        "else throw Error(`暗号化されていないファイルです`);let a=sw(i);await uw(a),t(a),alert(`バックアップを復元しました`)",
        "restore persistence",
    )

    # 3) Student Summary must aggregate across all months, while Monthly Summary
    # keeps the month dimension. Previously both sheets were generated from the
    # same month-keyed map.
    text = replace_once(
        text,
        r"let a=new Map;i\.filter\(e=>e\.集計対象===`対象`\)\.forEach\(e=>\{let t=`\$\{e\.学校\}\|\$\{e\.クラス\}\|\$\{e\.出席番号\}\|\$\{String\(e\.日付\)\.slice\(0,7\)\}`,n=a\.get\(t\)\|\|\{学校:e\.学校,クラス:e\.クラス,出席番号:e\.出席番号,月:String\(e\.日付\)\.slice\(0,7\),欠席:0,遅刻:0,早退:0,認欠:0,忌引:0\};n\[e\.区分\]=\(n\[e\.区分\]\|\|0\)\+1,a\.set\(t,n\)\}\);let o=Zf\.book_new\(\),s=\(e,t\)=>Zf\.book_append_sheet\(o,Zf\.json_to_sheet\(t\.length\?t:\[\{情報:`記録なし`\}\]\),e\);return s\(`Attendance Register`,i\),s\(`Student Summary`,Array\.from\(a\.values\(\)\)\),s\(`Monthly Summary`,Array\.from\(a\.values\(\)\)\)",
        "let a=new Map,o=new Map;i.filter(e=>e.集計対象===`対象`).forEach(e=>{let t=`${e.学校}|${e.クラス}|${e.出席番号}`,n=a.get(t)||{学校:e.学校,クラス:e.クラス,出席番号:e.出席番号,欠席:0,遅刻:0,早退:0,認欠:0,忌引:0};n[e.区分]=(n[e.区分]||0)+1,a.set(t,n);let r=`${t}|${String(e.日付).slice(0,7)}`,c=o.get(r)||{学校:e.学校,クラス:e.クラス,出席番号:e.出席番号,月:String(e.日付).slice(0,7),欠席:0,遅刻:0,早退:0,認欠:0,忌引:0};c[e.区分]=(c[e.区分]||0)+1,o.set(r,c)});let s=Zf.book_new(),c=(e,t)=>Zf.book_append_sheet(s,Zf.json_to_sheet(t.length?t:[{情報:`記録なし`}]),e);return c(`Attendance Register`,i),c(`Student Summary`,Array.from(a.values())),c(`Monthly Summary`,Array.from(o.values()))",
        "Excel summary aggregation",
    )

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
