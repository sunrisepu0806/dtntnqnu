// Vercel tự triển khai tệp này thành /api/interest.
module.exports = async function handler(req, res) {
  const { handleInterest } = await import('../website/server/interest.mjs');
  return handleInterest(req, res);
};
