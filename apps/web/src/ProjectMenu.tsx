import { useEffect, useRef, useState } from "react";
import { useProjectStore } from "./stores/projectStore";
import { ChevronDownIcon, TrashIcon } from "./ui/icons";
import styles from "./ProjectMenu.module.css";

// A custom project picker: a styled trigger, a create-by-name field at the top,
// and each project as a row with a delete icon. Replaces the bare <select> + New
// + Delete buttons.
export function ProjectMenu() {
  const projects = useProjectStore((s) => s.projects);
  const selectedProjectId = useProjectStore((s) => s.selectedProjectId);
  const selectProject = useProjectStore((s) => s.selectProject);
  const createProject = useProjectStore((s) => s.createProject);
  const deleteProject = useProjectStore((s) => s.deleteProject);
  const busy = useProjectStore((s) => s.busy);

  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selected = projects.find((p) => p.id === selectedProjectId) ?? null;

  const create = async () => {
    const name = newName.trim();
    if (!name || busy) return;
    await createProject(name);
    setNewName("");
    setOpen(false);
  };

  return (
    <div ref={containerRef} className={styles.container}>
      <button className={styles.trigger} onClick={() => setOpen((v) => !v)} aria-haspopup="listbox" aria-expanded={open}>
        <span className={styles.triggerLabel}>{selected?.name ?? "Select a project"}</span>
        <ChevronDownIcon className={open ? `${styles.chevron} ${styles.chevronOpen}` : styles.chevron} />
      </button>

      {open ? (
        <div className={styles.panel} role="listbox">
          <form
            className={styles.createRow}
            onSubmit={(event) => {
              event.preventDefault();
              void create();
            }}
          >
            <input
              autoFocus
              className={styles.nameInput}
              placeholder="New project name…"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
            />
            <button type="submit" className={styles.createBtn} disabled={!newName.trim() || busy}>
              Create
            </button>
          </form>

          <div className={styles.list}>
            {projects.length === 0 ? (
              <div className={styles.emptyRow}>No projects yet</div>
            ) : (
              projects.map((project) => {
                const active = project.id === selectedProjectId;
                return (
                  <div key={project.id} className={active ? `${styles.rowWrap} ${styles.rowWrapActive}` : styles.rowWrap}>
                    <button
                      className={active ? `${styles.rowSelect} ${styles.rowSelectActive}` : styles.rowSelect}
                      onClick={() => {
                        selectProject(project.id);
                        setOpen(false);
                      }}
                    >
                      <span className={active ? `${styles.dot} ${styles.dotActive}` : styles.dot} />
                      <span className={styles.rowName}>{project.name}</span>
                    </button>
                    <button
                      className={styles.deleteBtn}
                      title={`Delete ${project.name}`}
                      aria-label={`Delete ${project.name}`}
                      onClick={() => {
                        if (window.confirm(`Delete "${project.name}"? This cannot be undone.`)) {
                          void deleteProject(project.id);
                        }
                      }}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
