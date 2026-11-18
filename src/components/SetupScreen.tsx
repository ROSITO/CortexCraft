import { useEffect, useState } from "react";
import { pickFolder, pickVault, suggestPipeline } from "../lib/vault";

export type SetupResult = {
  displayName: string;
  vaultPath: string;
  pipelinePath: string;
  llmEnabled: boolean;
};

type Props = {
  onComplete: (result: SetupResult) => Promise<void>;
};

export function SetupScreen({ onComplete }: Props) {
  const [name, setName] = useState("");
  const [vaultPath, setVaultPath] = useState("");
  const [pipelinePath, setPipelinePath] = useState("");
  const [enableLlm, setEnableLlm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void suggestPipeline()
      .then((p) => {
        if (p) setPipelinePath(p);
      })
      .catch(() => {
        /* optional */
      });
  }, []);

  const submit = async () => {
    if (!name.trim() || !vaultPath.trim()) {
      setError("Nom et vault sont obligatoires.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onComplete({
        displayName: name.trim(),
        vaultPath: vaultPath.trim(),
        pipelinePath: pipelinePath.trim(),
        llmEnabled: enableLlm && !!pipelinePath.trim(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="setup-screen">
      <div className="setup-card">
        <p className="eyebrow">CortexCraft</p>
        <h1>Configuration locale</h1>
        <p className="muted">
          Identité sur cette machine uniquement — pas de compte cloud. Le vault Obsidian reste la
          source de vérité.
        </p>

        <label className="field-label">
          Nom d’affichage
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Votre prénom"
            autoComplete="nickname"
          />
        </label>

        <label className="field-label">
          Vault Obsidian
          <div className="field-row">
            <input type="text" value={vaultPath} readOnly placeholder="Choisir un dossier…" />
            <button
              type="button"
              className="ghost"
              onClick={() =>
                void pickVault().then((p) => {
                  if (p) setVaultPath(p);
                })
              }
            >
              Parcourir
            </button>
          </div>
        </label>

        <label className="field-label">
          vault-pipeline (Claude headless) — optionnel
          <div className="field-row">
            <input
              type="text"
              value={pipelinePath}
              onChange={(e) => setPipelinePath(e.target.value)}
              placeholder="~/Documents/vault-pipeline"
            />
            <button
              type="button"
              className="ghost"
              onClick={() =>
                void pickFolder("Choisir vault-pipeline").then((p) => {
                  if (p) setPipelinePath(p);
                })
              }
            >
              Parcourir
            </button>
          </div>
        </label>

        <label className="check-row">
          <input
            type="checkbox"
            checked={enableLlm}
            disabled={!pipelinePath.trim()}
            onChange={(e) => setEnableLlm(e.target.checked)}
          />
          Activer Claude headless (llm.enabled) — jeton Keychain requis plus tard
        </label>

        {error && <p className="error">{error}</p>}

        <div className="agent-actions">
          <button
            type="button"
            className="primary"
            disabled={busy || !name.trim() || !vaultPath.trim()}
            onClick={() => void submit()}
          >
            {busy ? "…" : "Continuer"}
          </button>
        </div>
      </div>
    </div>
  );
}
