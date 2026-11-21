import "dotenv/config"
import { closePool } from "../src/db"
import settings from "./seedSettings"
import seedAdmin from "./seedAdmin"

(async () => {
    await seedAdmin();
    await settings()
})().catch(err => console.log(`[ ERROR ]`, err)).finally(async () => {
    await closePool()
    console.log(`Seeded!`)
})