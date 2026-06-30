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
        Migration {
            version: 5,
            description: "category_budgets",
            sql: include_str!("../migrations/0005_category_budgets.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "bill_dual_slot",
            sql: include_str!("../migrations/0006_bill_dual_slot.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "transfers",
            sql: include_str!("../migrations/0007_transfers.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "transfer_goal_endpoints",
            sql: include_str!("../migrations/0008_transfer_goal_endpoints.sql"),
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
            backup::mirror_backup,
            backup::archive_month,
            backup::list_archives,
            backup::list_archive_contents,
            backup::restore_from_archive,
            backup::delete_archive,
            backup::write_text_file,
            backup::read_text_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running the Household Ledger application");
}
