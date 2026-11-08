// The guide memo a new account starts with.
import { createHmac } from "node:crypto";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config, required } from "../config.js";
import { recordOnlyRaw } from "./billingRules.js";
import { Category } from "./categories.js";
import type { SearchInterpretation } from "./anthropic.js";
import { scanPages } from "./scanPages.js";
import { SOURCE_CATALOG, CAPTURE_TYPE_CATALOG } from "./sourceCatalog.js";
import { newestOfBoth, tagArrayLiteral, tagsArrayLiteral } from "./tagQuery.js";
import { tagLockChange, type LockState } from "./tagLock.js";
import { insertItem } from "./items.js";

// One real, deletable/editable example item so a brand-new account isn't a
// totally blank slate -- the home list has something to show, and the tag
// picker (which searches actual saved tags) has something to find. Shared
// by both the Kakao signup path (kakaoAuth.ts) and the guest/anonymous
// signup path (POST /auth/seed-sample) so neither one starts emptier than
// the other. Doubles as onboarding: it's written to explain the app's own
// share -> auto-tag -> search loop through an item that demonstrates it,
// rather than a generic placeholder unrelated to what a first-time opener
// actually needs to know. Best-effort at each call site: a seeding hiccup
// shouldn't block signup.
// The guide memo in the person's language (X-Cortex-Lang); Korean when
// unknown, since Kakao sign-ups don't send it.
const SAMPLES: Record<"ko" | "en" | "ja" | "zh-Hans" | "zh-Hant", { title: string; snippet: string; tags: string[]; text: string }> = {
  ko: {
    title: "저장 눌렀는데 어디로 갔지?",
    snippet: "Cortex 사용법 안내",
    tags: ["가이드", "첫기억"],
    text:
      "인스타 게시물이든, 유튜브 링크든, 캡처한 스크린샷이든 공유 버튼을 눌러 Cortex를 고르면 끝이에요. " +
      "제목과 태그는 AI가 붙여요. 사진이나 링크에는 왜 저장했는지 내 메모를 말로 남겨도 돼요. " +
      "나중에 찾을 땐 검색창에 단어를 치면 바로 나오고, 기억이 흐릿하면 문장으로 쓰고 ✦를 누르세요.\n\n" +
      "이렇게도 써요\n" +
      "· 좋아하는 연예인 사진·영상 링크를 모아 두기 (태그째 잠그면 홈에서도 안 보여요)\n" +
      "· 갤러리에 쌓인 캡처·메모를 옮겨 두고, 태그별로 정리하기\n" +
      "· 갤러리에 띄워 두기 싫은 사진은 옮긴 뒤 갤러리에서 지우고, 메모 잠금으로 가려 두기\n\n" +
      "이 메모는 지워도 되고, 첫 기억으로 둬도 돼요.",
  },
  en: {
    title: "Saved it, but where did it go?",
    snippet: "How to use Cortex",
    tags: ["guide", "first memory"],
    text:
      "Whether it's an Instagram post, a YouTube link or a screenshot, tap Share and pick Cortex. That's it. " +
      "AI adds the title and tags. For a photo or a link, you can also say why you saved it as your own note. " +
      "To find it later, type a word in search; if your memory is fuzzy, write a sentence and tap ✦.\n\n" +
      "Other ways to use it\n" +
      "· Collect photos and video links of your favorite stars (lock the tag and they stay off Home too)\n" +
      "· Move piled-up screenshots and notes out of your gallery and sort them by tag\n" +
      "· Move photos you don't want sitting in your gallery, delete them there, and hide them with a memo lock\n\n" +
      "You can delete this note or keep it as your first memory.",
  },
  ja: {
    title: "保存したのに、どこへ行った？",
    snippet: "Cortexの使い方",
    tags: ["ガイド", "はじめての記録"],
    text:
      "Instagramの投稿でも、YouTubeのリンクでも、スクリーンショットでも、共有ボタンからCortexを選べば完了です。" +
      "タイトルとタグはAIが付けます。写真やリンクには、なぜ保存したかを声でメモしても大丈夫です。" +
      "あとで探すときは検索欄に単語を入れればすぐ見つかります。記憶があいまいなら文章で書いて✦を押してください。\n\n" +
      "こんな使い方も\n" +
      "· 好きな芸能人の写真や動画リンクを集めておく（タグごとロックするとホームにも出ません）\n" +
      "· ギャラリーにたまったスクショやメモを移して、タグで整理する\n" +
      "· ギャラリーに置いておきたくない写真は移してからギャラリーで消し、メモロックで隠しておく\n\n" +
      "このメモは消しても、最初の記録として残してもかまいません。",
  },
  "zh-Hans": {
    title: "点了保存，跑哪儿去了？",
    snippet: "Cortex 使用说明",
    tags: ["指南", "第一条记录"],
    text:
      "无论是 Instagram 帖子、YouTube 链接还是截图，点分享并选择 Cortex 就完成了。" +
      "标题和标签由 AI 添加。照片或链接还可以用语音留下保存的原因。" +
      "以后要找时，在搜索框输入词语就能找到；记不清时就写一句话，再点 ✦。\n\n" +
      "还可以这样用\n" +
      "· 收集喜欢的明星照片和视频链接（整个标签上锁后，首页也不会显示）\n" +
      "· 把相册里堆积的截图和笔记移过来，按标签整理\n" +
      "· 不想留在相册里的照片，移过来后从相册删除，再用笔记锁藏起来\n\n" +
      "这条笔记可以删除，也可以留作你的第一条记录。",
  },
  "zh-Hant": {
    title: "按了儲存，跑去哪了？",
    snippet: "Cortex 使用說明",
    tags: ["指南", "第一筆記錄"],
    text:
      "無論是 Instagram 貼文、YouTube 連結還是截圖，點分享並選擇 Cortex 就完成了。" +
      "標題和標籤由 AI 加上。照片或連結還可以用語音留下儲存的原因。" +
      "之後要找時，在搜尋框輸入字詞就能找到；記不清時就寫一句話，再點 ✦。\n\n" +
      "還可以這樣用\n" +
      "· 收集喜歡的明星照片和影片連結（整個標籤上鎖後，首頁也不會顯示）\n" +
      "· 把相簿裡堆積的截圖和筆記移過來，依標籤整理\n" +
      "· 不想留在相簿裡的照片，移過來後從相簿刪除，再用筆記鎖藏起來\n\n" +
      "這則筆記可以刪除，也可以留作你的第一筆記錄。",
  },
};
export const SAMPLE_TITLES = Object.values(SAMPLES).map((s) => s.title);

function sampleFor(lang: string | null | undefined) {
  const l = (lang ?? "ko").toLowerCase();
  if (l.startsWith("ko")) return SAMPLES.ko;
  if (l.startsWith("ja")) return SAMPLES.ja;
  if (l.startsWith("zh")) return /hant|-tw|-hk|-mo/.test(l) ? SAMPLES["zh-Hant"] : SAMPLES["zh-Hans"];
  return SAMPLES.en;
}

export async function seedSampleItem(userId: string, lang?: string | null): Promise<void> {
  const sample = sampleFor(lang);
  await insertItem({
    userId,
    source: "memo",
    captureType: "text",
    rawText: sample.text,
    title: sample.title,
    snippet: sample.snippet,
    category: "기억할 것",
    tags: sample.tags,
    classificationStatus: "done",
  });
}
