// 每个版本改了什么：更新后右下角的提示、设置 → 系统 里的「更新说明」都从这里读
// 新版本加在最前面；每条写成用户看得懂的一句话，最要紧的放第一条

export interface ChangelogEntry {
  version: string
  date: string
  items: string[]
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.1.2',
    date: '2026-10-13',
    items: ['更新以后会像这样告诉你改了什么；设置 → 系统 里能看到每个版本的更新说明']
  },
  {
    version: '1.1.1',
    date: '2026-10-13',
    items: [
      '长期的事改成每天打卡：清单里只占一行，勾一下记今天，旁边显示打了几天卡；出差、假期这类可以关掉打卡',
      '长期的事不能再设重复，以前设过的会自动转过来，打过的勾都保留',
      '一句话添加认得「晚 6 点」「早 8 点」这样的说法'
    ]
  },
  {
    version: '1.1.0',
    date: '2026-10-10',
    items: [
      '新增「长期」：跨好几天的事放在清单最下面，周 / 月视图里能看到它们的范围',
      '跨天日程：「今晚 11 点到明早 7 点」「周五到周日」直接写一句就行，编辑栏里也能设',
      '说不准的开始和结束：「大概两周」「做完为止」「下个月开始」，周 / 月视图里那几天会渐渐变淡',
      '完成的待办会按完成先后，慢慢排到色带左下角',
      '桌角卡片：鼠标停在小黑点上看名字、点一下完成；「＋」在卡片旁边弹出快捷面板',
      '新图标；托盘图标跟着任务栏的深浅变'
    ]
  },
  {
    version: '1.0.0',
    date: '2026-09-19',
    items: ['第一个正式版']
  }
]

/** 比较两个版本号的大小（只看 主.次.修订，不看 -beta 这类后缀） */
function cmp(a: string, b: string): number {
  const pa = a.split('-')[0].split('.').map(Number)
  const pb = b.split('-')[0].split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0)
  return 0
}

/** 从 from 升级到 to，中间新出的版本（新的在前） */
export const newerThan = (from: string, to: string): ChangelogEntry[] => CHANGELOG.filter((e) => cmp(e.version, from) > 0 && cmp(e.version, to) <= 0)
