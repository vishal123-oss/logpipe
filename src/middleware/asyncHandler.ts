import { Request, Response, NextFunction } from 'express';

// async wrapper for controllers (systematic error handling)
export const asyncHandler = (fn: any) => (req: Request, res: Response, next: NextFunction) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// global error middleware
export const errorHandler = (err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Error:', err.message || err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
};
