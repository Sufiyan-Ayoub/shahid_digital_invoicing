import { pool } from "../src/db"
import type { SettingsInsert } from "../src/db"

const comments = {
    mail_settings: "/**\n" +
        " * Configuration Flags and Behavior:\n" +
        " * \n" +
        " * mode: \n" +
        " *   - otp = 0\n" +
        " *   - link = 1\n" +
        " * \n" +
        " * mail_verification: \n" +
        " *   - on  = 1\n" +
        " *   - off = 0\n" +
        " * \n" +
        " * is_welcome_mail: \n" +
        " *   - on  = 1\n" +
        " *   - off = 0\n" +
        " * \n" +
        " * update_user_on_new_session: \n" +
        " *   - off = 0\n" +
        " *   - on  = 1\n" +
        " * \n" +
        " * one_time_email_verification:\n" +
        " *   - false => email is verified every time whenever user signs up or signs in\n" +
        " *   - true  => email is verified only one-time on signup\n" +
        " */",
}



const data: SettingsInsert[] = [
    {
        okey: "mail_settings",
        comment: comments.mail_settings,
        ovalue: JSON.stringify({
            mode: 0,
            mail_verification: 1,
            is_welcome_mail: 1,
            update_user_on_new_session: 1,
            one_time_email_verification: 0,
            mail_expiry_in_hours: 24,
            max_verification_attempts: 7
        })
    }
]


const settings = async () => {
    for (const { okey, ovalue, comment = null } of data) {
        // Upsert on the unique `okey` so re-running the seeder is idempotent.
        const x = await pool.query<SettingsInsert>(
            `INSERT INTO settings (okey, ovalue, comment)
             VALUES ($1, $2, $3)
             ON CONFLICT (okey)
             DO UPDATE SET ovalue = EXCLUDED.ovalue,
                           comment = EXCLUDED.comment,
                           modified = now()`,
            [okey, ovalue, comment]
        )

        x
    }
}

export default settings