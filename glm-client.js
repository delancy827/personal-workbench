/**
 * Minimal GLM chat client for the browser.
 * API keys are supplied at runtime and are never written into this file.
 */
const GLM_API_ENDPOINT = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const FREE_GLM_MODELS = ['glm-4.7-flash', 'glm-4.6v-flash'];

class GlmClient {
  constructor(apiKey, model) {
    this.apiKey = (apiKey || '').trim();
    this.model = model || 'glm-4.7-flash';
    if (!FREE_GLM_MODELS.includes(this.model)) throw new Error('仅允许使用已配置的免费 GLM 模型');
  }

  async chat(messages, options) {
    options = options || {};
    if (!this.apiKey) throw new Error('请先填写智谱 API Key');
    const response = await fetch(GLM_API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + this.apiKey,
      },
      body: JSON.stringify({
        model: this.model,
        messages: messages,
        temperature: options.temperature == null ? 0.7 : options.temperature,
        max_tokens: options.max_tokens || 4096,
        thinking: options.thinking || { type: 'enabled' },
      }),
    });

    let body;
    try { body = await response.json(); }
    catch (e) { throw new Error('API 返回了无法解析的响应'); }
    if (!response.ok) {
      throw new Error((body.error && body.error.message) || body.message || ('HTTP ' + response.status));
    }
    const content = body.choices && body.choices[0] && body.choices[0].message && body.choices[0].message.content;
    if (Array.isArray(content)) return content.map(function (part) { return part.text || ''; }).join('');
    return String(content || '').trim();
  }

  async test() {
    return this.chat([{ role: 'user', content: '请只回复：连接成功。' }], {
      max_tokens: 32,
      thinking: { type: 'disabled' },
    });
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { GlmClient, GLM_API_ENDPOINT, FREE_GLM_MODELS };
