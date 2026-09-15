import express from 'express';
import { valuationRouter } from './routes/valuation.js';

const app = express();
app.use(valuationRouter);

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`valuation API listening on http://localhost:${port}`);
  console.log(`try: http://localhost:${port}/api/valuation/AAPL`);
});
