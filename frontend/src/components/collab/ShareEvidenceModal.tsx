import { useState } from "react";
import { Button, Icon, Input } from "../ui";
import { labGroupsApi } from "../../api/labGroups";

export function ShareEvidenceModal({
  groupId,
  onClose,
  onShared,
}: {
  groupId: number;
  onClose: () => void;
  onShared: () => void;
}) {
  const [evidenceType, setEvidenceType] = useState("ioc");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [source, setSource] = useState("");
  const [relatedIoc, setRelatedIoc] = useState("");
  const [relatedMitre, setRelatedMitre] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await labGroupsApi.shareEvidence(groupId, {
        evidence_type: evidenceType,
        title: title.trim(),
        description: description.trim() || undefined,
        source: source.trim() || undefined,
        related_ioc: relatedIoc.trim() || undefined,
        related_mitre_technique: relatedMitre.trim() || undefined,
      });
      onShared();
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Could not share evidence");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-[linear-gradient(145deg,rgba(29,33,45,.98),rgba(19,22,31,.98))] border border-white/[0.1] rounded-2xl p-5 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-[#e1e2ed] flex items-center gap-2">
            <Icon name="ios_share" className="text-[#b4c5ff]" /> Share Evidence
          </h3>
          <button onClick={onClose} className="text-[#8d90a0] hover:text-[#e1e2ed]">
            <Icon name="close" />
          </button>
        </div>
        <p className="text-[11px] text-[#8d90a0] mb-4">
          Only what you share here becomes visible to the rest of the team - your investigation stays private otherwise.
        </p>

        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-semibold text-[#8d90a0] uppercase tracking-wider">Type</label>
            <select
              value={evidenceType}
              onChange={(e) => setEvidenceType(e.target.value)}
              className="mt-1.5 w-full bg-[#0b0f18]/90 border border-white/[0.1] rounded-xl px-3.5 py-2.5 text-sm text-[#e1e2ed] focus:outline-none focus:border-[#7f9eff]"
            >
              <option value="ioc">IOC</option>
              <option value="event">Timeline event</option>
              <option value="artifact">Artifact</option>
              <option value="custom">Free-form note</option>
            </select>
          </div>
          <Input label="Title" name="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Malicious PowerShell download" />
          <Input label="Description" name="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          <Input label="Source" name="source" value={source} onChange={(e) => setSource(e.target.value)} placeholder="e.g. Sysmon Event ID 1" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Related IOC" name="related_ioc" value={relatedIoc} onChange={(e) => setRelatedIoc(e.target.value)} placeholder="e.g. 10.0.0.5" />
            <Input label="MITRE technique" name="related_mitre" value={relatedMitre} onChange={(e) => setRelatedMitre(e.target.value)} placeholder="e.g. T1059.001" />
          </div>
        </div>

        {error && <p className="mt-3 text-xs text-[#ffb4ab]">{error}</p>}

        <div className="mt-5 flex gap-2">
          <Button size="sm" onClick={submit} disabled={saving || !title.trim()}>
            <Icon name="check" className="text-sm" /> Share with team
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}
