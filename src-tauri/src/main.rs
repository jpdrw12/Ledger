mod backup;

use tauri_plugin_sql::{Migration, MigrationKind};

fn main() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create_initial_schema",
            sql: include_str!("../migrations/0001_init.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "auto_add_bills_and_month_debt_payments",
            sql: include_str!("../migrations/0002_auto_add_and_debt_payments.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "debt_payment_applied_flag",
            sql: include_str!("../migrations/0003_debt_payment_applied.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "debt_history_payment_link",
            sql: include_str!("../migrations/0004_debt_history_payment_link.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:ledger.db", migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            backup::backup_now,
            backup::list_backups,
            backup::list_folder_backups,
            backup::restore_backup,
            backup::restore_from_folder,
            backup::mirror_backup
        ])
        .run(tauri::generate_context!())
        .expect("error while running the Household Ledger application");
}
