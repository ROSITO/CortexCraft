//! CortexCraft settings via craft-settings (ArtCraft suite layout).
use craft_settings::{DocumentMut, Location, MigrateError, Settings, SettingsStore};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, PartialEq)]
#[serde(default)]
pub struct Prefs {
    pub vault: VaultPrefs,
    pub appearance: AppearancePrefs,
    pub agents: AgentPrefs,
    pub profile: ProfilePrefs,
    pub nomenclature: NomenclaturePrefs,
    pub keeper: KeeperPrefs,
}

impl Default for Prefs {
    fn default() -> Self {
        Self {
            vault: VaultPrefs::default(),
            appearance: AppearancePrefs::default(),
            agents: AgentPrefs::default(),
            profile: ProfilePrefs::default(),
            nomenclature: NomenclaturePrefs::default(),
            keeper: KeeperPrefs::default(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, PartialEq)]
#[serde(default)]
pub struct VaultPrefs {
    pub last_path: String,
}

impl Default for VaultPrefs {
    fn default() -> Self {
        Self {
            last_path: String::new(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, PartialEq)]
#[serde(default)]
pub struct AppearancePrefs {
    pub layout_mode: String,
    pub shape: String,
    pub group_by: String,
    pub theme: String,
    pub palette: String,
}

impl Default for AppearancePrefs {
    fn default() -> Self {
        Self {
            layout_mode: "semantic".into(),
            shape: "brain".into(),
            group_by: "space".into(),
            theme: "ink".into(),
            palette: "cortex".into(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, PartialEq)]
#[serde(default)]
pub struct AgentPrefs {
    /// local | rules | external
    pub tag_mode: String,
}

impl Default for AgentPrefs {
    fn default() -> Self {
        Self {
            tag_mode: "local".into(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, PartialEq)]
#[serde(default)]
pub struct ProfilePrefs {
    pub display_name: String,
}

impl Default for ProfilePrefs {
    fn default() -> Self {
        Self {
            display_name: String::new(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, PartialEq)]
#[serde(default)]
pub struct NomenclaturePrefs {
    /// Relative path inside the vault (e.g. Pipeline/CONVENTIONS.md).
    pub conventions_relpath: String,
    /// Expected top-level space folders.
    pub spaces: Vec<String>,
}

impl Default for NomenclaturePrefs {
    fn default() -> Self {
        Self {
            conventions_relpath: "Pipeline/CONVENTIONS.md".into(),
            spaces: Vec::new(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, PartialEq)]
#[serde(default)]
pub struct KeeperPrefs {
    /// Path to vault-pipeline root (contains keeper/).
    pub pipeline_path: String,
    pub llm_enabled: bool,
    pub model: String,
    pub max_turns: u32,
}

impl Default for KeeperPrefs {
    fn default() -> Self {
        Self {
            pipeline_path: String::new(),
            llm_enabled: false,
            model: "claude-opus-5".into(),
            max_turns: 120,
        }
    }
}

impl Settings for Prefs {
    const APP_ID: &'static str = "cortexcraft";
    const SCHEMA_VERSION: u32 = 4;

    fn migrate(_from: u32, _doc: &mut DocumentMut) -> Result<(), MigrateError> {
        Ok(())
    }
}

pub fn open_store() -> SettingsStore<Prefs> {
    let (store, _report) = SettingsStore::<Prefs>::open(Location::Auto);
    store
}
