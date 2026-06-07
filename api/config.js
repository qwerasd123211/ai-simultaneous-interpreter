module.exports = (req, res) => {
  const backendOrigin = process.env.LINGUA_BACKEND_ORIGIN || '';

  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.send(`window.LINGUA_BACKEND_ORIGIN = ${JSON.stringify(backendOrigin)};`);
};
