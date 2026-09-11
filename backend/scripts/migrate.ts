import { closeDb, runMigrations } from "../src/shared/db/client.js";

runMigrations()
  .then(() => {
    console.log("migrations applied");
    return closeDb();
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
