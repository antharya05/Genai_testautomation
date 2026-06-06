import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { listProjects } from "../api/client";
import type { Project } from "../types";

interface ProjectContextValue {
  projects: Project[];
  selectedProject: Project | null;
  setSelectedProject: (p: Project) => void;
  refreshProjects: () => Promise<void>;
  loading: boolean;
}

const ProjectContext = createContext<ProjectContextValue>({
  projects: [],
  selectedProject: null,
  setSelectedProject: () => {},
  refreshProjects: async () => {},
  loading: true,
});

const STORAGE_KEY = "selectedProjectId";

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProjectState] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  async function refreshProjects() {
    try {
      const all = await listProjects();
      setProjects(all);
      if (all.length === 0) {
        setSelectedProjectState(null);
        return;
      }
      // Restore persisted selection or default to first project
      const savedId = localStorage.getItem(STORAGE_KEY);
      const restored = savedId ? all.find(p => p.id === savedId) : null;
      setSelectedProjectState(restored ?? all[0]);
    } catch {
      // ignore — backend may be unreachable on initial load
    }
  }

  useEffect(() => {
    refreshProjects().finally(() => setLoading(false));
  }, []);

  function setSelectedProject(p: Project) {
    setSelectedProjectState(p);
    localStorage.setItem(STORAGE_KEY, p.id);
  }

  return (
    <ProjectContext.Provider value={{ projects, selectedProject, setSelectedProject, refreshProjects, loading }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  return useContext(ProjectContext);
}
