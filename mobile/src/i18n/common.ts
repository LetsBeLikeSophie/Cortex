import { strings } from './index';
import type { ItemCategory } from '../api/client';

// Words used across many screens: categories (stored in Korean in the
// database, shown in the UI language), relative times, item placeholders.

export const CATEGORY_LABEL = strings<Record<ItemCategory, string>>({
  ko: { '가볼 곳': '가볼 곳', '살 것': '살 것', '배울 것': '배울 것', '볼 것': '볼 것', '기억할 것': '기억할 것', 기타: '기타' },
  en: { '가볼 곳': 'Places', '살 것': 'To buy', '배울 것': 'To learn', '볼 것': 'To watch', '기억할 것': 'To remember', 기타: 'Other' },
  ja: { '가볼 곳': '行きたい所', '살 것': '買う物', '배울 것': '学ぶこと', '볼 것': '見る物', '기억할 것': '覚えること', 기타: 'その他' },
  'zh-Hans': { '가볼 곳': '想去的地方', '살 것': '想买的', '배울 것': '要学的', '볼 것': '要看的', '기억할 것': '要记住的', 기타: '其他' },
  'zh-Hant': { '가볼 곳': '想去的地方', '살 것': '想買的', '배울 것': '要學的', '볼 것': '要看的', '기억할 것': '要記住的', 기타: '其他' },
});

export function categoryLabel(category: string): string {
  return (CATEGORY_LABEL as Record<string, string>)[category] ?? category;
}

export const TIME = strings({
  ko: {
    justNow: '방금',
    minutes: (n: number) => `${n}분 전`,
    hours: (n: number) => `${n}시간 전`,
    yesterday: '어제',
    days: (n: number) => `${n}일 전`,
    weeks: (n: number) => `${n}주 전`,
    months: (n: number) => `${n}개월 전`,
    years: (n: number) => `${n}년 전`,
    monthDay: (m: number, d: number) => `${m}월 ${d}일`,
  },
  en: {
    justNow: 'just now',
    minutes: (n: number) => `${n} min ago`,
    hours: (n: number) => `${n} h ago`,
    yesterday: 'yesterday',
    days: (n: number) => `${n} days ago`,
    weeks: (n: number) => (n === 1 ? '1 week ago' : `${n} weeks ago`),
    months: (n: number) => (n === 1 ? '1 month ago' : `${n} months ago`),
    years: (n: number) => (n === 1 ? '1 year ago' : `${n} years ago`),
    monthDay: (m: number, d: number) => `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${d}`,
  },
  ja: {
    justNow: 'たった今',
    minutes: (n: number) => `${n}分前`,
    hours: (n: number) => `${n}時間前`,
    yesterday: '昨日',
    days: (n: number) => `${n}日前`,
    weeks: (n: number) => `${n}週間前`,
    months: (n: number) => `${n}か月前`,
    years: (n: number) => `${n}年前`,
    monthDay: (m: number, d: number) => `${m}月${d}日`,
  },
  'zh-Hans': {
    justNow: '刚刚',
    minutes: (n: number) => `${n}分钟前`,
    hours: (n: number) => `${n}小时前`,
    yesterday: '昨天',
    days: (n: number) => `${n}天前`,
    weeks: (n: number) => `${n}周前`,
    months: (n: number) => `${n}个月前`,
    years: (n: number) => `${n}年前`,
    monthDay: (m: number, d: number) => `${m}月${d}日`,
  },
  'zh-Hant': {
    justNow: '剛剛',
    minutes: (n: number) => `${n}分鐘前`,
    hours: (n: number) => `${n}小時前`,
    yesterday: '昨天',
    days: (n: number) => `${n}天前`,
    weeks: (n: number) => `${n}週前`,
    months: (n: number) => `${n}個月前`,
    years: (n: number) => `${n}年前`,
    monthDay: (m: number, d: number) => `${m}月${d}日`,
  },
});

export const COMMON = strings({
  ko: { yes: '예', no: '아니오', cancel: '취소', ok: '확인', close: '닫기', save: '저장', delete: '삭제', retry: '다시 시도', photo: '사진', waiting: '정리 대기', analyzing: '분석 중...', untitled: '(제목 없음)' },
  en: { yes: 'Yes', no: 'No', cancel: 'Cancel', ok: 'OK', close: 'Close', save: 'Save', delete: 'Delete', retry: 'Try again', photo: 'Photo', waiting: 'Waiting', analyzing: 'Analyzing...', untitled: '(Untitled)' },
  ja: { yes: 'はい', no: 'いいえ', cancel: 'キャンセル', ok: 'OK', close: '閉じる', save: '保存', delete: '削除', retry: 'もう一度', photo: '写真', waiting: '整理待ち', analyzing: '分析中...', untitled: '(タイトルなし)' },
  'zh-Hans': { yes: '是', no: '否', cancel: '取消', ok: '确定', close: '关闭', save: '保存', delete: '删除', retry: '重试', photo: '照片', waiting: '待整理', analyzing: '分析中...', untitled: '(无标题)' },
  'zh-Hant': { yes: '是', no: '否', cancel: '取消', ok: '確定', close: '關閉', save: '儲存', delete: '刪除', retry: '重試', photo: '照片', waiting: '待整理', analyzing: '分析中...', untitled: '(無標題)' },
});

// What an AI action has left this month, in its Bubble.
export const USES = strings({
  ko: { left: (n: number) => `${n}번 남음`, photosLeft: (n: number) => `${n}장 남음` },
  en: { left: (n: number) => `${n} left`, photosLeft: (n: number) => `${n} photo${n === 1 ? '' : 's'} left` },
  ja: { left: (n: number) => `残り${n}回`, photosLeft: (n: number) => `残り${n}枚` },
  'zh-Hans': { left: (n: number) => `剩 ${n} 次`, photosLeft: (n: number) => `剩 ${n} 张` },
  'zh-Hant': { left: (n: number) => `剩 ${n} 次`, photosLeft: (n: number) => `剩 ${n} 張` },
});
