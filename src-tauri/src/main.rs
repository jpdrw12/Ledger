mod backup;
mod updater;

use tauri_plugin_sql::{Migration, MigrationKind};

/// The database files that can hold a user profile. tauri-plugin-sql only
/// applies migrations to connection strings registered at compile time, so
/// profiles are a fixed set of slots: `ledger.db` is Profile 1 (pre-profiles
/// data lands there), and each extra profile claims the next file. A new file
/// gets the full migration chain on first open — i.e. a fresh ledger.
pub const PROFILE_DB_FILES: [&str; 7] = [
    "ledger.db",
    "profile2.db",
    "profile3.db",
    "profile4.db",
    "profile5.db",
    "profile6.db",
    // Hidden slot reserved for the interactive guide's throwaway demo data —
    // never shown in the profile picker. It's wiped + reseeded each tour rather
    // than deleted, because the SQL plugin consumes a connection's migrations on
    // first load per process and won't re-migrate a recreated file.
    "demo.db",
];

fn migrations() -> Vec<Migration> {
    vec![
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
        Migration {
            version: 9,
            description: "account_exclude_from_total",
            sql: include_str!("../migrations/0009_account_exclude_from_total.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 10,
            description: "card_budgets",
            sql: include_str!("../migrations/0010_card_budgets.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 11,
            description: "generic_seed_names",
            sql: include_str!("../migrations/0011_generic_seed_names.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 12,
            description: "sort_order",
            sql: include_str!("../migrations/0012_sort_order.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 13,
            description: "updated_at",
            sql: include_str!("../migrations/0013_updated_at.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 14,
            description: "goal_contribution_kind",
            sql: include_str!("../migrations/0014_goal_contribution_kind.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 15,
            description: "debt_spendable",
            sql: include_str!("../migrations/0015_debt_spendable.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 16,
            description: "debt_charges",
            sql: include_str!("../migrations/0016_debt_charges.sql"),
            kind: MigrationKind::Up,
        },
    ]
}

fn main() {
    let mut sql_builder = tauri_plugin_sql::Builder::default();
    for file in PROFILE_DB_FILES {
        sql_builder = sql_builder.add_migrations(&format!("sqlite:{file}"), migrations());
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(sql_builder.build())
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
            backup::delete_profile_db,
            backup::write_text_file,
            backup::read_text_file,
            updater::check_for_update,
            updater::install_update,
            updater::restart_app
        ])
        .run(tauri::generate_context!())
        .expect("error while running the Household Ledger application");
}
