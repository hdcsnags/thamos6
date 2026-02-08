import { useState, useEffect } from 'react';
import { File, Folder, ChevronRight, ChevronDown, FileCode, FileJson, FileText, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: FileNode[];
  size?: number;
  fileType?: string;
  hasFinding?: boolean;
}

interface FileExplorerProps {
  analysisId: string;
  onFileSelect: (filePath: string) => void;
  selectedFile: string | null;
  findings: Array<{ file_path: string }>;
}

export default function FileExplorer({ analysisId, onFileSelect, selectedFile, findings }: FileExplorerProps) {
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['root']));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFiles();
  }, [analysisId]);

  const loadFiles = async () => {
    try {
      const { data, error } = await supabase
        .from('extension_files')
        .select('file_path, file_size, file_type')
        .eq('analysis_id', analysisId)
        .order('file_path');

      if (error) throw error;

      if (data) {
        const filesWithFindings = new Set(findings.map(f => f.file_path));
        const tree = buildFileTree(data, filesWithFindings);
        setFileTree(tree);
      }
    } catch (error) {
      console.error('Error loading files:', error);
    } finally {
      setLoading(false);
    }
  };

  const buildFileTree = (files: any[], filesWithFindings: Set<string>): FileNode[] => {
    const root: FileNode[] = [];
    const folderMap = new Map<string, FileNode>();

    for (const file of files) {
      const parts = file.file_path.split('/');
      let currentLevel = root;
      let currentPath = '';

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        const isLastPart = i === parts.length - 1;

        if (isLastPart) {
          currentLevel.push({
            name: part,
            path: file.file_path,
            type: 'file',
            size: file.file_size,
            fileType: file.file_type,
            hasFinding: filesWithFindings.has(file.file_path)
          });
        } else {
          let folder = folderMap.get(currentPath);
          if (!folder) {
            folder = {
              name: part,
              path: currentPath,
              type: 'folder',
              children: []
            };
            folderMap.set(currentPath, folder);
            currentLevel.push(folder);
          }
          currentLevel = folder.children!;
        }
      }
    }

    return sortNodes(root);
  };

  const sortNodes = (nodes: FileNode[]): FileNode[] => {
    return nodes.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'folder' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    }).map(node => {
      if (node.children) {
        return { ...node, children: sortNodes(node.children) };
      }
      return node;
    });
  };

  const toggleFolder = (path: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedFolders(newExpanded);
  };

  const getFileIcon = (fileType: string) => {
    switch (fileType) {
      case 'js':
        return <FileCode className="w-4 h-4 text-yellow-400" />;
      case 'json':
        return <FileJson className="w-4 h-4 text-green-400" />;
      case 'html':
        return <FileText className="w-4 h-4 text-orange-400" />;
      case 'css':
        return <FileText className="w-4 h-4 text-blue-400" />;
      default:
        return <File className="w-4 h-4 text-slate-400" />;
    }
  };

  const renderNode = (node: FileNode, depth: number = 0) => {
    if (node.type === 'folder') {
      const isExpanded = expandedFolders.has(node.path);
      return (
        <div key={node.path}>
          <button
            onClick={() => toggleFolder(node.path)}
            className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-slate-800 transition-colors text-left"
            style={{ paddingLeft: `${depth * 16 + 12}px` }}
          >
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
            )}
            <Folder className="w-4 h-4 text-cyan-400 flex-shrink-0" />
            <span className="text-sm text-slate-300 truncate">{node.name}</span>
          </button>
          {isExpanded && node.children && (
            <div>
              {node.children.map(child => renderNode(child, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    return (
      <button
        key={node.path}
        onClick={() => onFileSelect(node.path)}
        className={`w-full flex items-center gap-2 px-3 py-1.5 hover:bg-slate-800 transition-colors text-left ${
          selectedFile === node.path ? 'bg-slate-800 border-l-2 border-cyan-500' : ''
        }`}
        style={{ paddingLeft: `${depth * 16 + 28}px` }}
      >
        {getFileIcon(node.fileType || '')}
        <span className="text-sm text-slate-300 truncate flex-1">{node.name}</span>
        {node.hasFinding && (
          <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
        )}
      </button>
    );
  };

  if (loading) {
    return (
      <div className="text-center py-8 text-slate-400">
        Loading files...
      </div>
    );
  }

  if (fileTree.length === 0) {
    return (
      <div className="text-center py-8 text-slate-400">
        No files found
      </div>
    );
  }

  return (
    <div className="overflow-y-auto max-h-[600px]">
      {fileTree.map(node => renderNode(node))}
    </div>
  );
}
