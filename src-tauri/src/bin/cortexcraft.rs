//! CortexCraft CLI — MCP server and vault utilities (craft-libs / ArtCraft).
use std::env;
use std::io::{self, BufReader};
use std::path::PathBuf;
use std::process;

use craft_mcp_server::{Info, Server};
use cortexcraft_lib::mcp_tools::CortexTools;
use cortexcraft_lib::prefs::{open_store, Prefs};
use cortexcraft_lib::vault::{migrate_layout_out_of_cortex, scan_vault_at};

fn usage() -> ! {
    eprintln!(
        "CortexCraft CLI

Usage:
  cortexcraft mcp --vault <path>     MCP stdio server (craft-mcp-server)
  cortexcraft scan --vault <path>    Print vault note count / sample
  cortexcraft migrate-layout --vault <path>
      Move CORTEX/imports + CORTEX/chats → root Apple Notes/, Health/, Chats/, …
  cortexcraft prefs                  Show craft-settings prefs path + values
  cortexcraft flags                  Show ArtCraft feature flags (AI-MCP, …)

Env:
  CORTEXCRAFT_VAULT   default vault when --vault omitted
"
    );
    process::exit(2);
}

fn vault_arg(args: &[String]) -> PathBuf {
    let mut path = None;
    let mut i = 0;
    while i < args.len() {
        if args[i] == "--vault" {
            if let Some(v) = args.get(i + 1) {
                path = Some(PathBuf::from(v));
                i += 2;
                continue;
            }
        }
        i += 1;
    }
    if let Some(p) = path {
        return p;
    }
    if let Ok(p) = env::var("CORTEXCRAFT_VAULT") {
        return PathBuf::from(p);
    }
    // fall back to craft-settings last_path
    let store = open_store();
    let last = store.get().vault.last_path.clone();
    if !last.is_empty() {
        return PathBuf::from(last);
    }
    eprintln!("missing --vault (or CORTEXCRAFT_VAULT / prefs.vault.last_path)");
    usage();
}

fn main() {
    let args: Vec<String> = env::args().skip(1).collect();
    let Some(cmd) = args.first().map(String::as_str) else {
        usage();
    };

    match cmd {
        "mcp" => {
            let vault = vault_arg(&args);
            // Gate on suite flag when present; still allow local use if unset/off file missing.
            let flags = craft_flags::load();
            if !flags.enabled_id("AI-MCP") {
                eprintln!(
                    "note: ArtCraft flag AI-MCP is off (craft-flags). Serving MCP anyway for CortexCraft CLI."
                );
            }
            let info = Info {
                name: "cortexcraft",
                title: "CortexCraft",
                version: env!("CARGO_PKG_VERSION"),
                max_line: 1 << 20,
            };
            let tools = CortexTools::new(vault);
            let mut server = Server::new(info, tools);
            let stdin = io::stdin();
            let mut input = BufReader::new(stdin.lock());
            let mut output = io::stdout().lock();
            if let Err(e) = server.serve(&mut input, &mut output) {
                eprintln!("mcp serve error: {e}");
                process::exit(1);
            }
        }
        "scan" => {
            let vault = vault_arg(&args);
            match scan_vault_at(&vault) {
                Ok((_, notes)) => {
                    println!("{} entries in {}", notes.len(), vault.display());
                    for n in notes.iter().take(12) {
                        println!("- [{}] {} ({})", n.kind, n.title, n.folder);
                    }
                }
                Err(e) => {
                    eprintln!("{e}");
                    process::exit(1);
                }
            }
        }
        "migrate-layout" => {
            let vault = vault_arg(&args);
            match migrate_layout_out_of_cortex(&vault) {
                Ok(r) => {
                    println!(
                        "migrated {} moved, {} skipped → {} ({})",
                        r.imported,
                        r.skipped,
                        r.folder,
                        vault.display()
                    );
                    for e in &r.errors {
                        eprintln!("warn: {e}");
                    }
                }
                Err(e) => {
                    eprintln!("{e}");
                    process::exit(1);
                }
            }
        }
        "prefs" => {
            let mut store = open_store();
            let prefs: &Prefs = store.get();
            println!("app_id=cortexcraft");
            println!("last_vault={}", prefs.vault.last_path);
            println!("layout_mode={}", prefs.appearance.layout_mode);
            let _ = store.tick(std::time::Instant::now());
        }
        "flags" => {
            let flags = craft_flags::load();
            println!("AI-MCP={}", flags.enabled_id("AI-MCP"));
            println!("AI-MODELS={}", flags.enabled_id("AI-MODELS"));
        }
        "help" | "-h" | "--help" => usage(),
        other => {
            eprintln!("unknown command: {other}");
            usage();
        }
    }
}
