pub mod importers;
pub mod keeper;
pub mod mcp_tools;
pub mod prefs;
pub mod vault;

pub use mcp_tools::CortexTools;
pub use prefs::{Prefs, open_store};
pub use vault::{DailyAppendResult, ImportResult, NoteEntry, TagUpdate, VaultRevision};

use std::path::PathBuf;
use std::sync::Mutex;

use vault::{
    append_daily_note, apply_agent_tags_under, import_chats_into, import_local_agent_chats,
    read_note_under, scan_vault_at, vault_revision_at, write_note_under, TagUpdate as VaultTagUpdate,
};

struct AppState {
    vault_root: Mutex<Option<PathBuf>>,
}

#[tauri::command]
fn scan_vault(path: String, state: tauri::State<'_, AppState>) -> Result<Vec<NoteEntry>, String> {
    let (canonical, notes) = scan_vault_at(PathBuf::from(path).as_path())?;
    *state.vault_root.lock().map_err(|_| "state lock poisoned")? = Some(canonical.clone());

    let mut store = prefs::open_store();
    store.update(|p| p.vault.last_path = canonical.to_string_lossy().into_owned());
    let _ = store.tick(std::time::Instant::now());

    Ok(notes)
}

#[tauri::command]
fn read_note(path: String, state: tauri::State<'_, AppState>) -> Result<String, String> {
    let guard = state.vault_root.lock().map_err(|_| "state lock poisoned")?;
    let Some(root) = guard.as_ref() else {
        return Err("Open a vault before reading notes".into());
    };
    read_note_under(root, PathBuf::from(path).as_path())
}

#[tauri::command]
fn write_note(
    path: String,
    body: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let guard = state.vault_root.lock().map_err(|_| "state lock poisoned")?;
    let Some(root) = guard.as_ref() else {
        return Err("Open a vault before writing notes".into());
    };
    write_note_under(root, PathBuf::from(path).as_path(), &body)
}

#[tauri::command]
fn vault_revision(state: tauri::State<'_, AppState>) -> Result<VaultRevision, String> {
    let guard = state.vault_root.lock().map_err(|_| "state lock poisoned")?;
    let Some(root) = guard.as_ref() else {
        return Err("Open a vault first".into());
    };
    vault_revision_at(root)
}

#[tauri::command]
fn import_chats(
    paths: Vec<String>,
    state: tauri::State<'_, AppState>,
) -> Result<ImportResult, String> {
    let guard = state.vault_root.lock().map_err(|_| "state lock poisoned")?;
    let Some(root) = guard.as_ref() else {
        return Err("Open a vault before importing chats".into());
    };
    let paths: Vec<PathBuf> = paths.into_iter().map(PathBuf::from).collect();
    import_chats_into(root, &paths)
}

#[tauri::command]
fn import_agent_chats(state: tauri::State<'_, AppState>) -> Result<ImportResult, String> {
    let guard = state.vault_root.lock().map_err(|_| "state lock poisoned")?;
    let Some(root) = guard.as_ref() else {
        return Err("Open a vault before importing agent chats".into());
    };
    import_local_agent_chats(root)
}

#[tauri::command]
fn append_daily(
    text: String,
    date: String,
    state: tauri::State<'_, AppState>,
) -> Result<DailyAppendResult, String> {
    let guard = state.vault_root.lock().map_err(|_| "state lock poisoned")?;
    let Some(root) = guard.as_ref() else {
        return Err("Open a vault before capturing".into());
    };
    append_daily_note(root, &text, &date)
}

#[tauri::command]
fn apply_agent_tags(
    updates: Vec<VaultTagUpdate>,
    state: tauri::State<'_, AppState>,
) -> Result<usize, String> {
    let guard = state.vault_root.lock().map_err(|_| "state lock poisoned")?;
    let Some(root) = guard.as_ref() else {
        return Err("Open a vault before applying tags".into());
    };
    apply_agent_tags_under(root, &updates)
}


#[tauri::command]
fn list_external_sources() -> Vec<importers::ExternalSource> {
    importers::list_external_sources()
}

#[tauri::command]
fn import_external(
    source: String,
    path: Option<String>,
    max_notes: Option<usize>,
    state: tauri::State<'_, AppState>,
) -> Result<ImportResult, String> {
    let guard = state.vault_root.lock().map_err(|_| "state lock poisoned")?;
    let Some(root) = guard.as_ref() else {
        return Err("Open a vault before importing".into());
    };
    match source.as_str() {
        "apple_notes" => importers::import_apple_notes(root, max_notes.unwrap_or(5000)),
        "apple_health" => {
            let Some(p) = path else {
                return Err("apple_health requires path to export.xml or folder".into());
            };
            importers::import_apple_health(root, PathBuf::from(p).as_path())
        }
        "markdown_export" | "notion" | "readwise" | "dayone" => {
            let Some(p) = path else {
                return Err("markdown_export requires a folder path".into());
            };
            let label = match source.as_str() {
                "notion" => "notion",
                "readwise" => "readwise",
                "dayone" => "dayone",
                _ => "markdown",
            };
            importers::import_markdown_tree(root, PathBuf::from(p).as_path(), label)
        }
        "gemini" => {
            let Some(p) = path else {
                return Err("gemini requires a JSON export path".into());
            };
            importers::import_gemini_takeout_stub(root, PathBuf::from(p).as_path())
        }
        other => Err(format!("unknown source `{other}`")),
    }
}

#[tauri::command]
fn get_prefs() -> Result<Prefs, String> {
    let store = prefs::open_store();
    Ok(store.get().clone())
}

#[tauri::command]
fn set_prefs(prefs: Prefs) -> Result<(), String> {
    let mut store = prefs::open_store();
    store.update(|p| *p = prefs);
    let _ = store.tick(std::time::Instant::now());
    Ok(())
}

#[tauri::command]
fn keeper_status() -> Result<keeper::KeeperStatus, String> {
    keeper::status_from_prefs()
}

#[tauri::command]
fn keeper_import_prefs() -> Result<keeper::KeeperStatus, String> {
    keeper::import_prefs_from_config()
}

#[tauri::command]
fn keeper_sync_config() -> Result<keeper::KeeperStatus, String> {
    keeper::sync_config_from_prefs()
}

#[tauri::command]
fn keeper_run(mode: String) -> Result<keeper::KeeperRunResult, String> {
    keeper::run_keeper(&mode)
}

#[tauri::command]
fn suggest_pipeline() -> Option<String> {
    keeper::suggest_pipeline_path()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            vault_root: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            scan_vault,
            read_note,
            write_note,
            vault_revision,
            import_chats,
            import_agent_chats,
            apply_agent_tags,
            append_daily,
            list_external_sources,
            import_external,
            get_prefs,
            set_prefs,
            keeper_status,
            keeper_import_prefs,
            keeper_sync_config,
            keeper_run,
            suggest_pipeline
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
