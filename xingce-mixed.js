(function (root) {
  'use strict';
  /**
   * 三桶油完整卷预留（60 行测 + 40 价值观）。
   * 现阶段禁止把价值观 workbench_data 与行测 xingce_quiz_data 混写。
   * 未来若做混合卷，应在这里做「只读组装」，输出试卷结构，而不是合并两套做题历史。
   */
  root.XingceMixed = {
    weights: { aptitude: 60, values: 40 },
    ready: false,
    explain: function () {
      return '混合组卷仅预留：可同时只读抽取行测题库与价值观题库生成试卷视图，绝不合并两边的错题/收藏/统计。当前未实现。';
    },
    buildFullPaper: function (opts) {
      throw new Error('buildFullPaper 未实现（预留扩展）');
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
