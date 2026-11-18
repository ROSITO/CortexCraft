//! Thin bridge to an external vault-pipeline keeper (Claude Code headless).
//! Does not store tokens — only detects Keychain / PATH and spawns keeper.py.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::prefs::{self, Prefs};

pub const KEYCHAIN_SERVICE: &str = "vault-keeper-claude-token";

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct KeeperStatus {
    pub pipeline_path: String,
    pub pipeline_ok: bool,
    pub vault_in_config: String,
    pub claude_on_path: bool,
    pub token_present: bool,
    pub llm_enabled: bool,
    pub model: String,
    pub max_turns: u32,
    pub last_journal: Option<String>,
    pub hint: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct KeeperRunResult {
    pub ok: bool,
    pub mode: String,
    pub stdout: String,
    pub stderr: String,
    pub code: Option<i32>,
}

fn expand_user(path: &str) -> PathBuf {
    if let Some(rest) = path.strip_prefix("~/") {
        if let Some(home) = dirs_home() {
            return home.join(rest);
        }
    }
    if path == "~" {
        if let Some(home) = dirs_home() {
            return home;
        }
    }
    PathBuf::from(path)
}

fn dirs_home() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

fn which_claude() -> bool {
    Command::new("which")
        .arg("claude")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

fn token_present() -> bool {
    if std::env::var_os("CLAUDE_CODE_OAUTH_TOKEN").is_some() {
        return true;
    }
    // Presence only — never pass `-w` (would load the secret into this process).
    Command::new("security")
        .args(["find-generic-password", "-s", KEYCHAIN_SERVICE])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

fn config_path(pipeline: &Path) -> PathBuf {
    pipeline.join("keeper").join("config.json")
}

fn read_config(pipeline: &Path) -> Result<Value, String> {
    let path = config_path(pipeline);
    let raw = fs::read_to_string(&path)
        .map_err(|e| format!("cannot read {}: {e}", path.display()))?;
    serde_json::from_str(&raw).map_err(|e| format!("invalid keeper config.json: {e}"))
}

fn write_config(pipeline: &Path, value: &Value) -> Result<(), String> {
    let path = config_path(pipeline);
    let raw =
        serde_json::to_string_pretty(value).map_err(|e| format!("serialize config: {e}"))?;
    fs::write(&path, raw + "\n").map_err(|e| format!("cannot write {}: {e}", path.display()))
}

fn latest_journal(vault: &Path) -> Option<String> {
    let dir = vault.join("Pipeline").join("journal");
    let mut entries: Vec<_> = fs::read_dir(&dir)
        .ok()?
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path()
                .extension()
                .and_then(|x| x.to_str())
                .map(|x| x.eq_ignore_ascii_case("md"))
                .unwrap_or(false)
        })
        .collect();
    entries.sort_by_key(|e| e.file_name());
    let last = entries.last()?;
    let name = last.file_name().to_string_lossy().into_owned();
    let body = fs::read_to_string(last.path()).ok()?;
    let preview: String = body.chars().take(400).collect();
    Some(format!("{name}\n{preview}"))
}

fn resolve_pipeline(prefs: &Prefs) -> PathBuf {
    let raw = prefs.keeper.pipeline_path.trim();
    if !raw.is_empty() {
        return expand_user(raw);
    }
    expand_user("~/Documents/vault-pipeline")
}

pub fn status_from_prefs() -> Result<KeeperStatus, String> {
    let prefs = prefs::open_store().get().clone();
    let pipeline = resolve_pipeline(&prefs);
    let pipeline_ok = config_path(&pipeline).is_file();
    let mut vault_in_config = String::new();
    let mut llm_enabled = prefs.keeper.llm_enabled;
    let mut model = prefs.keeper.model.clone();
    let mut max_turns = prefs.keeper.max_turns;
    if pipeline_ok {
        if let Ok(cfg) = read_config(&pipeline) {
            if let Some(v) = cfg.get("vault").and_then(|x| x.as_str()) {
                vault_in_config = v.to_string();
            }
            if let Some(llm) = cfg.get("llm") {
                if let Some(b) = llm.get("enabled").and_then(|x| x.as_bool()) {
                    llm_enabled = b;
                }
                if let Some(m) = llm.get("model").and_then(|x| x.as_str()) {
                    model = m.to_string();
                }
                if let Some(t) = llm.get("max_turns").and_then(|x| x.as_u64()) {
                    max_turns = t as u32;
                }
            }
        }
    }
    let vault_path = if !prefs.vault.last_path.is_empty() {
        PathBuf::from(&prefs.vault.last_path)
    } else {
        expand_user(&vault_in_config)
    };
    let claude = which_claude();
    let token = token_present();
    let hint = if !pipeline_ok {
        "Choisissez le dossier vault-pipeline (contient keeper/config.json).".into()
    } else if !claude {
        "Binaire `claude` introuvable dans le PATH.".into()
    } else if !token {
        format!(
            "Jeton manquant — `claude setup-token`, puis `./keeper/poser_jeton.sh` (service `{KEYCHAIN_SERVICE}`)."
        )
    } else if !llm_enabled {
        "Claude headless détecté ; llm.enabled=false (activez-le dans Réglages).".into()
    } else {
        "Keeper prêt (launchd / Run depuis l'app).".into()
    };
    Ok(KeeperStatus {
        pipeline_path: pipeline.to_string_lossy().into_owned(),
        pipeline_ok,
        vault_in_config,
        claude_on_path: claude,
        token_present: token,
        llm_enabled,
        model,
        max_turns,
        last_journal: latest_journal(&vault_path),
        hint,
    })
}

/// Sync vault path + llm block from CortexCraft prefs into keeper/config.json.
/// Requires an explicit `pipeline_path` in prefs (no silent fallback overwrite).
pub fn sync_config_from_prefs() -> Result<KeeperStatus, String> {
    let prefs = prefs::open_store().get().clone();
    if prefs.keeper.pipeline_path.trim().is_empty() {
        return Err(
            "pipeline_path vide — enregistrez le chemin vault-pipeline avant de synchroniser."
                .into(),
        );
    }
    let pipeline = resolve_pipeline(&prefs);
    if !config_path(&pipeline).is_file() {
        return Err(format!(
            "keeper/config.json introuvable sous {}",
            pipeline.display()
        ));
    }
    let mut cfg = read_config(&pipeline)?;
    if !prefs.vault.last_path.is_empty() {
        cfg["vault"] = Value::String(prefs.vault.last_path.clone());
    }
    cfg["pipeline"] = Value::String(pipeline.to_string_lossy().into_owned());
    let llm = cfg
        .as_object_mut()
        .ok_or("config root must be object")?
        .entry("llm")
        .or_insert_with(|| Value::Object(Default::default()));
    let obj = llm.as_object_mut().ok_or("llm must be an object")?;
    obj.insert("enabled".into(), Value::Bool(prefs.keeper.llm_enabled));
    obj.insert("model".into(), Value::String(prefs.keeper.model.clone()));
    obj.insert(
        "max_turns".into(),
        Value::Number(prefs.keeper.max_turns.into()),
    );
    write_config(&pipeline, &cfg)?;
    status_from_prefs()
}

/// Import llm.* + pipeline path from config.json into CortexCraft prefs (no write back).
pub fn import_prefs_from_config() -> Result<KeeperStatus, String> {
    let mut store = prefs::open_store();
    let pipeline = {
        let prefs = store.get().clone();
        resolve_pipeline(&prefs)
    };
    if !config_path(&pipeline).is_file() {
        return status_from_prefs();
    }
    let cfg = read_config(&pipeline)?;
    store.update(|p| {
        if p.keeper.pipeline_path.trim().is_empty() {
            p.keeper.pipeline_path = pipeline.to_string_lossy().into_owned();
        }
        if let Some(llm) = cfg.get("llm") {
            if let Some(b) = llm.get("enabled").and_then(|x| x.as_bool()) {
                p.keeper.llm_enabled = b;
            }
            if let Some(m) = llm.get("model").and_then(|x| x.as_str()) {
                p.keeper.model = m.to_string();
            }
            if let Some(t) = llm.get("max_turns").and_then(|x| x.as_u64()) {
                p.keeper.max_turns = t as u32;
            }
        }
    });
    let _ = store.tick(std::time::Instant::now());
    status_from_prefs()
}

pub fn run_keeper(mode: &str) -> Result<KeeperRunResult, String> {
    let mode = match mode {
        "dry-run" | "run" | "status" => mode,
        other => return Err(format!("mode invalide `{other}` (dry-run|run|status)")),
    };
    let prefs = prefs::open_store().get().clone();
    let pipeline = resolve_pipeline(&prefs);
    let script = pipeline.join("keeper").join("keeper.py");
    if !script.is_file() {
        return Err(format!("keeper.py introuvable: {}", script.display()));
    }
    // Do not auto-sync before run — avoids overwriting a live config with unset prefs.
    // Callers must `keeper_sync_config` after an explicit save.
    let flag = format!("--{mode}");
    let output = Command::new("python3")
        .arg(&script)
        .arg(&flag)
        .current_dir(&pipeline)
        .output()
        .map_err(|e| format!("spawn keeper: {e}"))?;
    let stdout = truncate(&String::from_utf8_lossy(&output.stdout), 12_000);
    let stderr = truncate(&String::from_utf8_lossy(&output.stderr), 4_000);
    Ok(KeeperRunResult {
        ok: output.status.success(),
        mode: mode.to_string(),
        stdout,
        stderr,
        code: output.status.code(),
    })
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        return s.to_string();
    }
    let mut end = max;
    while end > 0 && !s.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}\n…(truncated)", &s[..end])
}

/// Probe default pipeline path for first-run suggestions.
pub fn suggest_pipeline_path() -> Option<String> {
    let candidate = expand_user("~/Documents/vault-pipeline");
    if config_path(&candidate).is_file() {
        Some(candidate.to_string_lossy().into_owned())
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn suggest_pipeline_finds_local_checkout() {
        let p = suggest_pipeline_path();
        assert!(p.is_some(), "expected ~/Documents/vault-pipeline");
        let p = p.unwrap();
        assert!(config_path(Path::new(&p)).is_file());
    }

    #[test]
    fn status_does_not_panic() {
        let st = status_from_prefs().expect("status");
        assert!(!st.hint.is_empty());
        // Presence check must not require loading the secret
        let _ = st.token_present;
    }

    #[test]
    fn truncate_utf8_safe() {
        let s = "éééééééééé";
        let t = truncate(s, 5);
        assert!(t.contains('…') || t.chars().count() <= 6);
    }

    #[test]
    fn sync_refuses_empty_pipeline_path() {
        // Without writing prefs: resolve may fall back, but sync requires explicit path.
        // Ensure the error path exists by calling with current store — if pipeline_path empty, Err.
        let prefs = prefs::open_store().get().clone();
        if prefs.keeper.pipeline_path.trim().is_empty() {
            let err = sync_config_from_prefs().unwrap_err();
            assert!(err.contains("pipeline_path"));
        }
    }
}
