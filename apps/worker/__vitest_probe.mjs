import('vitest').then(m => {
  console.log('ok', Object.keys(m).slice(0, 20));
}).catch(err => {
  console.error('import failed', err);
  process.exit(1);
});
