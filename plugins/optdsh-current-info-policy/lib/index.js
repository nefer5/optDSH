export const name = 'optdsh-current-info-policy';
export const inject = ['systemPrompt'];

export function apply(ctx) {
  ctx.systemPrompt.section({
    name: 'optdsh:current-information',
    order: 10050,
    text: '查询“最新、现在、近期、新版本”等时效性资讯前，先检查当前时间上下文，以当前日期为检索与判断基准；若没有时间读数或需要更精确时间，先通过只读工具查询系统时间。核对官方来源与发布日期，不因首批搜索结果出现旧版本就只搜索该版本，也不把旧报道直接称为当前最新。',
  });
}
