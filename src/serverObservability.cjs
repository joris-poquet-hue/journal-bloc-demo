const { randomUUID } = require('node:crypto');

const SAFE_CODE_PATTERN = /^[A-Za-z0-9_.:-]{1,80}$/;

function getSafeErrorDetails(error) {
  const code = String(error?.code ?? error?.name ?? 'Error');
  const status = Number(error?.status ?? 0);

  return {
    errorCode: SAFE_CODE_PATTERN.test(code) ? code : 'Error',
    errorStatus:
      Number.isInteger(status) && status >= 400 && status <= 599
        ? status
        : undefined,
  };
}

function writeOperationalLog(level, event, fields = {}) {
  const payload = {
    event,
    level,
    requestId: fields.requestId || randomUUID(),
    timestamp: new Date().toISOString(),
    ...fields,
  };
  const serialized = JSON.stringify(payload);

  if (level === 'error') {
    console.error(serialized);
  } else if (level === 'warn') {
    console.warn(serialized);
  } else {
    console.info(serialized);
  }

  return payload;
}

function reportServerError(event, error, fields = {}) {
  return writeOperationalLog('error', event, {
    ...fields,
    ...getSafeErrorDetails(error),
  });
}

module.exports = {
  getSafeErrorDetails,
  reportServerError,
  writeOperationalLog,
};
