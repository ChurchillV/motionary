import { repo } from "@/lib/db";

export function eta(done: number, total: number, startedAt: number): string {
  if (!done) return "?";
  const msLeft = ((Date.now() - startedAt) / done) * (total - done);
  const min = Math.round(msLeft / 60000);
  return min < 1 ? "<1 min" : min < 60 ? `${min} min` : `${(min / 60).toFixed(1)} h`;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Run a script's main(), flush the local store and exit with a clear status. */
export function run(name: string, main: () => Promise<void>) {
  console.log(`▶ ${name}  (store: ${repo.mode()})`);
  main()
    .then(() => {
      repo.flush();
      console.log(`✔ ${name} done`);
    })
    .catch((e) => {
      repo.flush();
      console.error(`✖ ${name} failed:`, e instanceof Error ? e.message : e);
      process.exit(1);
    });
}
