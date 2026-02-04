const MAX_PARSE_DEPTH = 4;

const tryParseJson = (value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }

  const firstChar = trimmed[0];
  const lastChar = trimmed[trimmed.length - 1];
  const looksLikeJson =
    (firstChar === '{' && lastChar === '}') ||
    (firstChar === '[' && lastChar === ']');

  if (!looksLikeJson) {
    return trimmed;
  }

  try {
    return JSON.parse(trimmed);
  } catch (error) {
    console.warn('error-parser: failed to parse JSON string', error);
    return trimmed;
  }
};

const extractFromPayload = (payload, depth = 0) => {
  if (payload == null || depth > MAX_PARSE_DEPTH) {
    return { message: null, code: null };
  }

  if (typeof payload === 'string') {
    const parsed = tryParseJson(payload);
    if (parsed === payload) {
      const trimmed = payload.trim();
      return { message: trimmed || null, code: null };
    }

    return extractFromPayload(parsed, depth + 1);
  }

  if (typeof payload === 'object') {
    const code = payload.code || null;

    if (typeof payload.message === 'string' && payload.message.trim()) {
      return { message: payload.message.trim(), code };
    }

    if (payload.error !== undefined) {
      const nested = extractFromPayload(payload.error, depth + 1);
      return {
        message: nested.message,
        code: nested.code || code
      };
    }

    if (typeof payload.description === 'string' && payload.description.trim()) {
      return { message: payload.description.trim(), code };
    }
  }

  return { message: null, code: null };
};

const parseErrorInfo = (rawError, fallbackMessage) => {
  const normalised = tryParseJson(rawError);
  const { message, code } = extractFromPayload(normalised);
  return {
    message: message || fallbackMessage,
    code: code || null
  };
};

module.exports = {
  parseErrorInfo
};

