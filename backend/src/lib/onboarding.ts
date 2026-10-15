import { insertItem, ItemSource } from "./supabase.js";
import type { Category } from "./categories.js";

// First-run "어디에 주로 쓰실 거예요?" picker: each use case pre-fills the
// home tab strip with a few tags and drops in example items carrying those
// same tags, so every new tab opens onto something instead of an empty list.
// Every example also carries EXAMPLE_TAG, so they're easy to find and clear
// out together once the real saves start coming in. Content is deliberately
// generic (no real group/brand/person names) -- it's illustrating a shape
// of use, not recommending anything.
export const EXAMPLE_TAG = "예시";

interface Example {
  source: ItemSource;
  title: string;
  snippet: string;
  category: Category;
  tags: string[];
}

interface UseCase {
  tabs: string[];
  examples: Example[];
}

export const USE_CASES = {
  fandom: {
    tabs: ["포토카드", "직캠", "공지"],
    examples: [
      { source: "instagram", title: "콘서트 포토카드 교환 목록", snippet: "멤버별로 교환 가능한 포카를 정리한 게시글 캡처", category: "기억할 것", tags: ["포토카드", "교환"] },
      { source: "youtube", title: "음악방송 직캠 모음", snippet: "이번 컴백 무대 직캠만 모아둔 영상 링크", category: "볼 것", tags: ["직캠", "음악방송"] },
      { source: "kakaotalk", title: "팬미팅 예매 일정 공지", snippet: "선예매 오픈 시간과 본인 인증 마감일 정리", category: "기억할 것", tags: ["공지", "예매"] },
    ],
  },
  food: {
    tabs: ["맛집", "카페", "여행"],
    examples: [
      { source: "instagram", title: "성수동 크로플 맛집", snippet: "주말 오전엔 웨이팅 길다는 크로플 가게", category: "가볼 곳", tags: ["맛집", "성수동"] },
      { source: "instagram", title: "바다 보이는 카페", snippet: "창가 자리 예약 가능한 오션뷰 카페", category: "가볼 곳", tags: ["카페", "오션뷰"] },
      { source: "safari", title: "1박 2일 바닷가 여행 코스", snippet: "동선 짧게 짠 1박 2일 코스와 숙소 후보", category: "기억할 것", tags: ["여행", "코스"] },
    ],
  },
  shopping: {
    tabs: ["위시리스트", "할인", "선물"],
    examples: [
      { source: "instagram", title: "겨울 코트 위시리스트", snippet: "핏이랑 색 비교하려고 모아둔 코트 세 벌", category: "살 것", tags: ["위시리스트", "코트"] },
      { source: "safari", title: "무선 이어폰 할인 링크", snippet: "이번 주말까지 할인하는 무선 이어폰 상품 페이지", category: "살 것", tags: ["할인", "이어폰"] },
      { source: "kakaotalk", title: "생신 선물 후보", snippet: "가족 단톡방에서 나온 선물 후보 세 가지", category: "살 것", tags: ["선물", "가족"] },
    ],
  },
  study: {
    tabs: ["레시피", "공부", "꿀팁"],
    examples: [
      { source: "youtube", title: "자취생 김치찌개 레시피", snippet: "재료 다섯 개로 끓이는 15분 김치찌개", category: "배울 것", tags: ["레시피", "김치찌개"] },
      { source: "safari", title: "엑셀 VLOOKUP 3분 정리", snippet: "자주 틀리는 범위 고정까지 한 번에 정리한 글", category: "배울 것", tags: ["공부", "엑셀"] },
      { source: "instagram", title: "니트 보풀 제거 꿀팁", snippet: "집에 있는 도구로 보풀 없애는 방법", category: "배울 것", tags: ["꿀팁", "생활"] },
    ],
  },
} satisfies Record<string, UseCase>;

export type UseCaseKey = keyof typeof USE_CASES;
export const USE_CASE_KEYS = Object.keys(USE_CASES) as UseCaseKey[];

const EXAMPLE_NOTE =
  "코르텍스가 어떻게 쓰이는지 보여주는 예시예요. 이런 식으로 저장하면 같은 태그끼리 홈 탭에 모여요. " +
  "다 봤으면 지워도 되고, '예시' 태그로 한 번에 찾을 수 있어요.";

// The home tabs to pin for the picked use cases, in pick order, deduped.
export function tabsFor(keys: UseCaseKey[]): string[] {
  const tabs: string[] = [];
  for (const key of keys) for (const tab of USE_CASES[key].tabs) if (!tabs.includes(tab)) tabs.push(tab);
  return tabs;
}

// Inserts the chosen use cases' examples (already-classified rows -- no
// Claude call) and returns the home tabs to pin.
export async function seedUseCases(userId: string, keys: UseCaseKey[]): Promise<string[]> {
  for (const key of keys) {
    for (const ex of USE_CASES[key].examples) {
      await insertItem({
        userId,
        source: ex.source,
        captureType: "text",
        rawText: EXAMPLE_NOTE,
        title: ex.title,
        snippet: ex.snippet,
        category: ex.category,
        tags: [...ex.tags, EXAMPLE_TAG],
        classificationStatus: "done",
      });
    }
  }
  return tabsFor(keys);
}
