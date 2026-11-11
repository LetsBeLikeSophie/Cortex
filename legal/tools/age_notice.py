"""Advance notice of the 18+ change (decision L6), shown at the top of the
terms and privacy pages in every language until it takes effect.

Unfavourable to some users, so it is announced 30+ days ahead: notice
2026-11-12, effective 2026-12-13. On 2026-12-13 the clause goes into the
body text and these boxes come out (re-run with --remove).

    python legal/tools/age_notice.py          # add / refresh the boxes
    python legal/tools/age_notice.py --remove # take them out
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

STYLE = ".notice { background: var(--soft); border-radius: 8px; padding: 14px 16px; margin: 0 0 28px; font-size: 14px; }\n.notice b { font-weight: 600; }\n"

TERMS = {
    "terms.html": "<b>개정 예정 안내</b> (공고 2026년 11월 12일 · 시행 2026년 12월 13일)<br>제5조에 4항이 새로 생깁니다: “서비스는 만 18세 이상만 이용할 수 있습니다. 만 18세 미만임이 확인되면 운영자는 이용계약을 해지하고 계정과 콘텐츠를 삭제할 수 있습니다.” 동의하지 않으면 시행일 전에 탈퇴할 수 있으며, 시행일 이후 계속 이용하면 동의한 것으로 봅니다.",
    "terms-en.html": "<b>Upcoming change</b> (announced November 12, 2026 · effective December 13, 2026)<br>Article 5 gets a new paragraph 4: “You must be 18 or older to use the Service. If we learn that a user is under 18, we may end the agreement and delete the account and its content.” If you don't agree, you can delete your account before that date; using the Service after it means you accept the change.",
    "terms-ja.html": "<b>改定のお知らせ</b>（公表 2026年11月12日 · 施行 2026年12月13日）<br>第5条に第4項を新設します：「本サービスは18歳以上の方のみご利用いただけます。18歳未満であることが判明した場合、運営者は利用契約を解除し、アカウントとコンテンツを削除することがあります。」同意されない場合は施行日までに退会できます。施行日以降もご利用を続けた場合は、改定に同意したものとみなします。",
    "terms-zh-hans.html": "<b>修订预告</b>（公布 2026年11月12日 · 生效 2026年12月13日）<br>第5条新增第4款：“本服务仅限18岁及以上人士使用。如确认用户未满18岁，运营者可以解除使用协议并删除其账号和内容。”如不同意，可在生效日前注销账号；生效日后继续使用即视为同意本次修订。",
    "terms-zh-hant.html": "<b>修訂預告</b>（公告 2026年11月12日 · 生效 2026年12月13日）<br>第5條新增第4項：「本服務僅限18歲以上人士使用。如確認使用者未滿18歲，營運者得終止使用契約並刪除其帳號與內容。」如不同意，可於生效日前刪除帳號；生效日後繼續使用即視為同意本次修訂。",
}
PRIVACY = {
    "privacy.html": "<b>개정 예정 안내</b> (공고 2026년 11월 12일 · 시행 2026년 12월 13일)<br>10항의 아동 관련 문장이 다음으로 바뀝니다: “이 서비스는 만 18세 이상만 이용할 수 있으며, 만 18세 미만의 개인정보를 알고 수집하지 않습니다. 만 18세 미만의 정보가 수집된 것을 알게 되면 지체 없이 삭제합니다.”",
    "privacy-en.html": "<b>Upcoming change</b> (announced November 12, 2026 · effective December 13, 2026)<br>The sentence about children becomes: “The Service is only for people 18 or older, and we do not knowingly collect personal data of anyone under 18. If we learn that we have, we delete it without delay.”",
    "privacy-ja.html": "<b>改定のお知らせ</b>（公表 2026年11月12日 · 施行 2026年12月13日）<br>児童に関する文を次のとおり改めます：「本サービスは18歳以上の方のみご利用いただけます。18歳未満の方の個人情報を故意に収集することはありません。収集したことが判明した場合は、遅滞なく削除します。」",
    "privacy-zh-hans.html": "<b>修订预告</b>（公布 2026年11月12日 · 生效 2026年12月13日）<br>关于儿童的句子将改为：“本服务仅限18岁及以上人士使用，我们不会有意收集未满18岁人士的个人信息。如发现已收集，将立即删除。”",
    "privacy-zh-hant.html": "<b>修訂預告</b>（公告 2026年11月12日 · 生效 2026年12月13日）<br>關於兒童的句子將改為：「本服務僅限18歲以上人士使用，我們不會故意蒐集未滿18歲人士的個人資料。如發現已蒐集，將立即刪除。」",
}

BOX = re.compile(r'\n  <div class="notice" id="age-notice">.*?</div>', re.S)


def main(remove: bool) -> None:
    for name, text in {**TERMS, **PRIVACY}.items():
        path = os.path.join(HERE, name)
        if not os.path.exists(path):
            print("skip (no file)", name)
            continue
        s = open(path, encoding="utf8").read()
        s = BOX.sub("", s)
        if not remove:
            if ".notice {" not in s:
                s = s.replace("</style>", STYLE + "</style>", 1)
            s, n = re.subn(r'(<div class="crosslink">.*?</div>)', lambda m: m.group(1) + f'\n  <div class="notice" id="age-notice">{text}</div>', s, count=1, flags=re.S)
            assert n == 1, name
        open(path, "w", encoding="utf8").write(s)
        print("removed" if remove else "noticed", name)


if __name__ == "__main__":
    main("--remove" in sys.argv)
