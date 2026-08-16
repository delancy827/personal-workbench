(function (global) {
  'use strict';

  var AUTHORITY_WEIGHT = {
    OFFICIAL: 6,
    USER_CONFIRMED: 5,
    HISTORICAL: 4,
    CANDIDATE_REPORT: 3,
    RESEARCH: 2,
    INFERENCE: 1,
    AI_ANALYSIS: 0
  };

  function query(items, options) {
    options = options || {};
    var queryText = String(options.query || '').trim().toLowerCase();
    var tags = (options.tags || []).map(function (tag) { return String(tag).toLowerCase(); });
    var list = (items || []).filter(function (item) {
      if (item.is_deleted || item.status === 'superseded') return false;
      if (options.visibility && item.visibility !== options.visibility) return false;
      if (options.truthClass && item.truth_class !== options.truthClass) return false;
      if (options.recruitmentYear && item.recruitment_year && item.recruitment_year !== options.recruitmentYear) return false;
      return true;
    });
    return list.map(function (item) {
      var haystack = [item.title, item.content, (item.tags || []).join(' ')].join(' ').toLowerCase();
      var score = AUTHORITY_WEIGHT[item.authority] || 0;
      if (queryText && haystack.indexOf(queryText) >= 0) score += 10;
      tags.forEach(function (tag) { if ((item.tags || []).some(function (itemTag) { return String(itemTag).toLowerCase() === tag; })) score += 5; });
      return { item: item, score: score };
    }).filter(function (result) { return !queryText || result.score >= 10; })
      .sort(function (a, b) { return b.score - a.score || (b.item.updated_at || '').localeCompare(a.item.updated_at || ''); })
      .slice(0, options.limit || 12)
      .map(function (result) { return result.item; });
  }

  function forPrompt(items, options) {
    return query(items, options).map(function (item) {
      return {
        title: item.title,
        content: String(item.content || '').slice(0, 900),
        truth_class: item.truth_class,
        authority: item.authority,
        source: item.source,
        tags: item.tags || []
      };
    });
  }

  global.KnowledgeBase = { query: query, forPrompt: forPrompt };
})(window);
