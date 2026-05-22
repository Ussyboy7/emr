"use client";

import { useState, useEffect, useCallback } from 'react';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { StandardPagination } from '@/components/shared/StandardPagination';
import { DashboardLayout } from '@/components/shared/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { labService, radiologyService, type RadiologyTemplate as ApiRadiologyTemplate, type LabTemplate as ApiLabTemplate } from '@/lib/services';
import {
  FileText, Search, Eye, Plus, Edit, Trash2, Copy, CheckCircle2,
  Loader2, Settings, ListPlus, ScanLine, Activity, Clock,
  Heart, Scan, FlaskConical, Microscope, GripVertical,
  ChevronUp, ChevronDown,
} from 'lucide-react';

interface TemplateField {
  id: string;
  name: string;
  unit: string;
  normalRangeMin?: string;
  normalRangeMax?: string;
  normalRangeText?: string;
  criticalMin?: string;
  criticalMax?: string;
  dataType: 'numeric' | 'text' | 'select';
  options?: string[];
  required: boolean;
}

interface TestTemplate {
  id: string;
  name: string;
  code: string;
  category: string;
  description: string;
  fields: TemplateField[];
  specimenType: string;
  turnaroundTime: string;
  status: 'Active' | 'Inactive';
  createdAt: string;
  updatedAt: string;
  version: number;
}

// Transform API template to frontend format
const transformTemplate = (apiTemplate: ApiLabTemplate): TestTemplate => {
  // Parse fields from normal_range JSON or use fields array if available
  let fields: TemplateField[] = [];
  if ((apiTemplate as any).fields && Array.isArray((apiTemplate as any).fields)) {
    fields = (apiTemplate as any).fields;
  } else if (apiTemplate.normal_range && typeof apiTemplate.normal_range === 'object') {
    // Convert normal_range JSON to fields array
    const nr: any = apiTemplate.normal_range;
    const order = Array.isArray(nr._order) ? nr._order : null;
    const keys = order
      ? order.filter((k: any) => typeof k === 'string' && nr[k] != null)
      : Object.keys(nr).filter((k) => !k.startsWith('_'));
    fields = keys.map((name: string) => {
      const value: any = nr[name];
      const field: TemplateField = {
        id: `f-${name}`,
        name,
        unit: value.unit || '',
        normalRangeMin: value.min || value.normalRangeMin,
        normalRangeMax: value.max || value.normalRangeMax,
        normalRangeText: value.range || value.normalRangeText,
        dataType: value.dataType || 'numeric',
        options: value.options,
        required: value.required !== false,
      };
      return field;
    });
  }
  
  return {
    id: apiTemplate.id.toString(),
    name: apiTemplate.name,
    code: apiTemplate.code,
    category: (apiTemplate as any).category || 'chemistry', // Read from backend API
    description: apiTemplate.description || '',
    fields,
    specimenType: apiTemplate.sample_type,
    turnaroundTime: (apiTemplate as any).turnaround_time || '', // Read from backend API
    status: apiTemplate.is_active !== false ? 'Active' : 'Inactive',
    createdAt: apiTemplate.created_at || new Date().toISOString().split('T')[0],
    updatedAt: apiTemplate.updated_at || new Date().toISOString().split('T')[0],
    version: (apiTemplate as any).version || 1,
  };
};

const categories = ['All', 'chemistry', 'hematology', 'microbiology', 'serology', 'toxicology'];

export default function TestTemplatesPage() {
  const [templates, setTemplates] = useState<TestTemplate[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('all');
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);

  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    chemistry: 0,
    hematology: 0,
    microbiology: 0,
    serology: 0,
    toxicology: 0,
  });

  // Dialog states
  const [selectedTemplate, setSelectedTemplate] = useState<TestTemplate | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isFieldEditDialogOpen, setIsFieldEditDialogOpen] = useState(false);
  const [editingField, setEditingField] = useState<TemplateField | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Field options management (within view dialog)
  const [viewFieldName, setViewFieldName] = useState('');
  const [viewFieldOptions, setViewFieldOptions] = useState<{id: number; value: string}[]>([]);
  const [loadingViewOptions, setLoadingViewOptions] = useState(false);
  const [newOptionValue, setNewOptionValue] = useState('');
  const [editingOptionIdx, setEditingOptionIdx] = useState<number | null>(null);
  const [editingOptionValue, setEditingOptionValue] = useState('');

  // Form states
  const [formData, setFormData] = useState({
    name: '', code: '', category: 'chemistry', description: '',
    specimenType: '', turnaroundTime: '',
    fields: [] as TemplateField[]
  });
  const [newField, setNewField] = useState<{
    name: string;
    unit: string;
    normalRangeMin: string;
    normalRangeMax: string;
    normalRangeText: string;
    criticalMin: string;
    criticalMax: string;
    dataType: 'numeric' | 'text' | 'select';
    options: string[];
    required: boolean;
  }>({
    name: '', unit: '', normalRangeMin: '', normalRangeMax: '', normalRangeText: '',
    criticalMin: '', criticalMax: '', dataType: 'numeric', options: [], required: false
  });

  const loadTemplateStats = useCallback(async () => {
    try {
      const base = { page: 1, page_size: 1 } as const;
      const cats = ['chemistry', 'hematology', 'microbiology', 'serology', 'toxicology'] as const;
      const [totalRes, activeRes, ...catRes] = await Promise.all([
        labService.getTemplates({ ...base }),
        labService.getTemplates({ ...base, is_active: true }),
        ...cats.map((c) => labService.getTemplates({ ...base, category: c })),
      ]);
      setStats({
        total: totalRes.count ?? 0,
        active: activeRes.count ?? 0,
        chemistry: catRes[0]?.count ?? 0,
        hematology: catRes[1]?.count ?? 0,
        microbiology: catRes[2]?.count ?? 0,
        serology: catRes[3]?.count ?? 0,
        toxicology: catRes[4]?.count ?? 0,
      });
    } catch {
      /* keep previous */
    }
  }, []);

  useEffect(() => {
    void loadTemplateStats();
  }, [loadTemplateStats]);

  const loadTemplates = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      let is_active: boolean | undefined;
      if (statusFilter === 'active') is_active = true;
      else if (statusFilter === 'inactive') is_active = false;
      const response = await labService.getTemplates({
        page: currentPage,
        page_size: itemsPerPage,
        search: debouncedSearch.trim() || undefined,
        category: categoryFilter !== 'All' ? categoryFilter : undefined,
        is_active,
      });
      const transformed = (response.results || []).map(transformTemplate);
      setTemplates(transformed);
      setTotalCount(typeof response.count === 'number' ? response.count : transformed.length);
    } catch (err: any) {
      setError(err.message || 'Failed to load templates');
      toast.error('Failed to load templates. Please try again.');
      console.error('Error loading templates:', err);
    } finally {
      setLoading(false);
    }
  }, [currentPage, itemsPerPage, debouncedSearch, categoryFilter, statusFilter]);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, categoryFilter, statusFilter, itemsPerPage]);

  const getCategoryBadge = (category: string) => {
    switch (category) {
      case 'chemistry': return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/50';
      case 'hematology': return 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/50';
      case 'microbiology': return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/50';
      case 'toxicology': return 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/50';
      case 'serology': return 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/50';
      default: return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/50';
    }
  };

  const addField = () => {
    if (!newField.name) {
      toast.error('Please enter field name');
      return;
    }
    const field: TemplateField = {
      id: `f-${Date.now()}`,
      name: newField.name,
      unit: newField.unit,
      normalRangeMin: newField.normalRangeMin || undefined,
      normalRangeMax: newField.normalRangeMax || undefined,
      normalRangeText: newField.normalRangeText || undefined,
      criticalMin: newField.criticalMin || undefined,
      criticalMax: newField.criticalMax || undefined,
      dataType: newField.dataType,
      options: newField.dataType === 'select' ? newField.options : undefined,
      required: true
    };
    setFormData(prev => ({ ...prev, fields: [...prev.fields, field] }));
    setNewField({
      name: '', unit: '', normalRangeMin: '', normalRangeMax: '', normalRangeText: '',
      criticalMin: '', criticalMax: '', dataType: 'numeric', options: [], required: false
    });
    toast.success('Field added');
  };

  const removeField = (fieldId: string) => {
    setFormData(prev => ({ ...prev, fields: prev.fields.filter(f => f.id !== fieldId) }));
  };

  const [dragFieldIndex, setDragFieldIndex] = useState<number | null>(null);

  const handleFieldDragStart = (index: number) => { setDragFieldIndex(index); };
  const handleFieldDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragFieldIndex === null || dragFieldIndex === index) return;
    setFormData(prev => {
      const fields = [...prev.fields];
      const [moved] = fields.splice(dragFieldIndex, 1);
      fields.splice(index, 0, moved);
      return { ...prev, fields };
    });
    setDragFieldIndex(index);
  };
  const handleFieldDragEnd = () => { setDragFieldIndex(null); };

  const moveFieldUp = (index: number) => {
    setFormData(prev => {
      if (index <= 0) return prev;
      const fields = [...prev.fields];
      [fields[index - 1], fields[index]] = [fields[index], fields[index - 1]];
      return { ...prev, fields };
    });
  };

  const moveFieldDown = (index: number) => {
    setFormData(prev => {
      if (index >= prev.fields.length - 1) return prev;
      const fields = [...prev.fields];
      [fields[index], fields[index + 1]] = [fields[index + 1], fields[index]];
      return { ...prev, fields };
    });
  };

  const editField = (field: TemplateField) => {
    setEditingField(field);
    setNewField({
      name: field.name,
      unit: field.unit,
      normalRangeMin: field.normalRangeMin || '',
      normalRangeMax: field.normalRangeMax || '',
      normalRangeText: field.normalRangeText || '',
      criticalMin: field.criticalMin || '',
      criticalMax: field.criticalMax || '',
      dataType: field.dataType,
      options: field.options || [],
      required: field.required
    });
    setIsFieldEditDialogOpen(true);
  };

  const updateField = () => {
    if (!editingField) return;

    setFormData(prev => ({
      ...prev,
      fields: prev.fields.map(f =>
        f.id === editingField.id
          ? {
              ...f,
              name: newField.name,
              unit: newField.unit,
              normalRangeMin: newField.normalRangeMin || undefined,
              normalRangeMax: newField.normalRangeMax || undefined,
              normalRangeText: newField.normalRangeText || undefined,
              criticalMin: newField.criticalMin || undefined,
              criticalMax: newField.criticalMax || undefined,
              dataType: newField.dataType,
              options: newField.dataType === 'select' ? newField.options : undefined,
              required: newField.required,
            }
          : f
      )
    }));

    setEditingField(null);
    setNewField({
      name: '', unit: '', normalRangeMin: '', normalRangeMax: '', normalRangeText: '',
      criticalMin: '', criticalMax: '', dataType: 'numeric' as const, options: [], required: false
    });
    setIsFieldEditDialogOpen(false);
  };

  const handleCreate = async () => {
    if (!formData.name || !formData.code || formData.fields.length === 0) {
      toast.error('Please fill in all required fields');
      return;
    }
    setIsSubmitting(true);

    try {
      const fieldNames = formData.fields.map(f => f.name);

      // Convert fields array to normal_range JSON format with display order
      const normalRange: Record<string, any> = {
        _order: fieldNames,
      };
      formData.fields.forEach(field => {
        const meta: Record<string, any> = {
          unit: field.unit,
          dataType: field.dataType,
          required: field.required,
        };
        if (field.normalRangeMin) meta.min = field.normalRangeMin;
        if (field.normalRangeMax) meta.max = field.normalRangeMax;
        if (field.normalRangeText) meta.range = field.normalRangeText;
        if (field.criticalMin) meta.critical_min = field.criticalMin;
        if (field.criticalMax) meta.critical_max = field.criticalMax;
        if (field.dataType === 'select' && field.options?.length) meta.options = field.options;
        normalRange[field.name] = meta;
      });

      const templateData: Record<string, any> = {
        name: formData.name,
        code: formData.code,
        description: formData.description,
        sample_type: formData.specimenType,
        normal_range: normalRange,
        is_active: true,
        category: formData.category,
        turnaround_time: formData.turnaroundTime,
        sort_order: totalCount, // New templates go to the end
      };

      await labService.createTemplate(templateData);
      toast.success(`Template "${formData.name}" created`);
      void loadTemplates();
      void loadTemplateStats();
      setIsCreateDialogOpen(false);
      resetForm();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create template');
      console.error('Error creating template:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = async () => {
    if (!selectedTemplate || !formData.name) return;
    setIsSubmitting(true);

    try {
      const templateId = parseInt(selectedTemplate.id);
      if (isNaN(templateId)) {
        toast.error('Invalid template ID');
        return;
      }

      const fieldNames = formData.fields.map(f => f.name);

      // Convert fields array to normal_range JSON format with display order
      const normalRange: Record<string, any> = {
        _order: fieldNames,
      };
      formData.fields.forEach(field => {
        const meta: Record<string, any> = {
          unit: field.unit,
          dataType: field.dataType,
          required: field.required,
        };
        if (field.normalRangeMin) meta.min = field.normalRangeMin;
        if (field.normalRangeMax) meta.max = field.normalRangeMax;
        if (field.normalRangeText) meta.range = field.normalRangeText;
        if (field.criticalMin) meta.critical_min = field.criticalMin;
        if (field.criticalMax) meta.critical_max = field.criticalMax;
        if (field.dataType === 'select' && field.options?.length) meta.options = field.options;
        normalRange[field.name] = meta;
      });

      const templateData: Record<string, any> = {
        name: formData.name,
        code: formData.code,
        description: formData.description,
        sample_type: formData.specimenType,
        normal_range: normalRange,
        is_active: selectedTemplate?.status === 'Active' || true,
        category: formData.category,
        turnaround_time: formData.turnaroundTime,
      };

      await labService.updateTemplate(templateId, templateData);
      void loadTemplates();
      void loadTemplateStats();
      toast.success(`Template "${formData.name}" updated`);
      setIsEditDialogOpen(false);
      resetForm();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update template');
      console.error('Error updating template:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedTemplate) return;
    setIsSubmitting(true);

    try {
      const templateId = parseInt(selectedTemplate.id);
      if (isNaN(templateId)) {
        toast.error('Invalid template ID');
        return;
      }

      await labService.deleteTemplate(templateId);
      void loadTemplates();
      void loadTemplateStats();
      toast.success(`Template "${selectedTemplate.name}" deleted`);
      setIsDeleteDialogOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete template');
      console.error('Error deleting template:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDuplicate = async (template: TestTemplate) => {
    try {
      setIsSubmitting(true);
      const templateId = parseInt(template.id);
      if (isNaN(templateId)) {
        toast.error('Invalid template ID');
        return;
      }

      // Get the original template
      const original = await labService.getTemplate(templateId);
      
      // Create a duplicate with modified name and code
      // Only include fields that exist in the backend model
      const duplicateData = {
        name: `${original.name} (Copy)`,
        code: `${original.code}_COPY`,
        description: original.description || '',
        sample_type: original.sample_type,
        normal_range: original.normal_range || {},
        is_active: false, // Start as inactive
      };

      await labService.createTemplate(duplicateData);
      void loadTemplates();
      void loadTemplateStats();
      toast.success(`Template duplicated`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to duplicate template');
      console.error('Error duplicating template:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleStatus = async (template: TestTemplate) => {
    try {
      const templateId = parseInt(template.id);
      if (isNaN(templateId)) {
        toast.error('Invalid template ID');
        return;
      }

      const newStatus = template.status === 'Active' ? false : true;
      await labService.updateTemplate(templateId, { is_active: newStatus });
      void loadTemplates();
      void loadTemplateStats();
      toast.success(`Template ${template.status === 'Active' ? 'deactivated' : 'activated'}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to update template status');
      console.error('Error toggling template status:', err);
    }
  };

  const resetForm = () => {
    setFormData({ name: '', code: '', category: 'chemistry', description: '', specimenType: '', turnaroundTime: '', fields: [] });
    setNewField({
      name: '', unit: '', normalRangeMin: '', normalRangeMax: '', normalRangeText: '',
      criticalMin: '', criticalMax: '', dataType: 'numeric', options: [], required: false
    });
  };

  const openViewDialog = (template: TestTemplate) => { setSelectedTemplate(template); setIsViewDialogOpen(true); };
  const openEditDialog = (template: TestTemplate) => {
    setSelectedTemplate(template);
    setFormData({
      name: template.name, 
      code: template.code, 
      category: template.category,
      description: template.description, 
      specimenType: template.specimenType,
      turnaroundTime: template.turnaroundTime, 
      fields: template.fields.map(f => ({ ...f })) // Create a copy to avoid reference issues
    });
    setIsEditDialogOpen(true);
  };
  const openDeleteDialog = (template: TestTemplate) => { setSelectedTemplate(template); setIsDeleteDialogOpen(true); };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
              <FileText className="h-8 w-8 text-amber-500" />
              Test Templates
            </h1>
            <p className="text-muted-foreground mt-1">Manage lab test templates and parameters</p>
          </div>
          <Button onClick={() => { resetForm(); setIsCreateDialogOpen(true); }} className="bg-amber-500 hover:bg-amber-600">
            <Plus className="h-4 w-4 mr-2" />New Template
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Templates</p>
                  <p className="text-2xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400">{stats.total}</p>
                </div>
                <FileText className="h-8 w-8 text-blue-400" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-rose-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Hematology</p>
                  <p className="text-2xl sm:text-3xl font-bold text-rose-600 dark:text-rose-400">{stats.hematology}</p>
                </div>
                <Activity className="h-8 w-8 text-rose-400" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-amber-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Chemistry</p>
                  <p className="text-2xl sm:text-3xl font-bold text-amber-600 dark:text-amber-400">{stats.chemistry}</p>
                </div>
                <FlaskConical className="h-8 w-8 text-amber-400" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-emerald-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Microbiology</p>
                  <p className="text-2xl sm:text-3xl font-bold text-emerald-600 dark:text-emerald-400">{stats.microbiology}</p>
                </div>
                <Microscope className="h-8 w-8 text-emerald-400" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
              <div className="relative flex-1 min-w-[min(100%,16rem)]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search templates..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-[160px]"><SelectValue placeholder="Category" /></SelectTrigger>
                  <SelectContent>
                    {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[130px]"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Templates List */}
        <div className="space-y-3">
          {loading ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">
              <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin opacity-50" />
              <p>Loading templates...</p>
            </CardContent></Card>
          ) : error ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-red-600 dark:text-red-400">{error}</p>
              <Button variant="outline" className="mt-4" onClick={loadTemplates}>Retry</Button>
            </CardContent></Card>
          ) : templates.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No templates found</p>
            </CardContent></Card>
          ) : (
            templates.map((template, index) => (
              <Card key={template.id} className={`border-l-4 hover:shadow-md transition-shadow ${
                template.status === 'Inactive' ? 'border-l-gray-400 opacity-60' :
                template.category === 'chemistry' ? 'border-l-amber-500' :
                template.category === 'hematology' ? 'border-l-rose-500' :
                template.category === 'microbiology' ? 'border-l-emerald-500' :
                template.category === 'serology' ? 'border-l-purple-500' : 
                template.category === 'toxicology' ? 'border-l-red-500' : 'border-l-blue-500'
              }`}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    {/* Avatar */}
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                      template.category === 'chemistry' ? 'bg-amber-100 dark:bg-amber-900/30' :
                      template.category === 'hematology' ? 'bg-rose-100 dark:bg-rose-900/30' :
                      template.category === 'microbiology' ? 'bg-emerald-100 dark:bg-emerald-900/30' :
                      template.category === 'serology' ? 'bg-purple-100 dark:bg-purple-900/30' : 
                      template.category === 'toxicology' ? 'bg-red-100 dark:bg-red-900/30' : 'bg-blue-100 dark:bg-blue-900/30'
                    }`}>
                      {template.category === 'chemistry' ? <FlaskConical className="h-4 w-4 text-amber-600" /> :
                       template.category === 'hematology' ? <Activity className="h-4 w-4 text-rose-600" /> :
                       template.category === 'microbiology' ? <Microscope className="h-4 w-4 text-emerald-600" /> :
                       template.category === 'serology' ? <Heart className="h-4 w-4 text-purple-600" /> :
                       template.category === 'toxicology' ? <FlaskConical className="h-4 w-4 text-red-600" /> :
                       <FlaskConical className="h-4 w-4 text-blue-600" />}
                    </div>
                    
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      {/* Row 1: Name + Badges + Actions */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <span className="font-semibold text-foreground truncate">{template.name}</span>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{template.code}</Badge>
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getCategoryBadge(template.category)}`}>{template.category}</Badge>
                          {template.status === 'Inactive' && <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-gray-500">Inactive</Badge>}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openViewDialog(template)}>
                            <Eye className="h-4 w-4 text-muted-foreground hover:text-primary" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEditDialog(template)}>
                            <Edit className="h-4 w-4 text-muted-foreground hover:text-blue-500" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleDuplicate(template)}>
                            <Copy className="h-4 w-4 text-muted-foreground hover:text-violet-500" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => toggleStatus(template)}>
                            <Settings className="h-4 w-4 text-muted-foreground hover:text-amber-500" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-rose-500 hover:text-rose-600" onClick={() => openDeleteDialog(template)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      
                      {/* Row 2: Details */}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                        <span>{template.fields.length} parameters</span>
                        <span>•</span>
                        <span>{template.specimenType}</span>
                        <span>•</span>
                        <span>TAT: {template.turnaroundTime}</span>
                        <span>•</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Pagination */}
        {totalCount > 0 && (
          <Card className="p-4">
            <StandardPagination
              currentPage={currentPage}
              totalItems={totalCount}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={(n) => {
                setItemsPerPage(n);
                setCurrentPage(1);
              }}
              itemName="templates"
            />
          </Card>
        )}

        {/* View Dialog */}
        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className="w-[95vw] sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-amber-500" />Template Details</DialogTitle>
              <DialogDescription>{selectedTemplate?.name}</DialogDescription>
            </DialogHeader>
            {selectedTemplate && (
              <div className="space-y-4 py-4">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{selectedTemplate.code}</Badge>
                  <Badge variant="outline" className={getCategoryBadge(selectedTemplate.category)}>{selectedTemplate.category}</Badge>
                  {selectedTemplate.status === 'Inactive' && <Badge variant="outline" className="text-gray-500">Inactive</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">{selectedTemplate.description}</p>
                <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-muted/50 text-sm">
                  <div><span className="text-muted-foreground">Specimen:</span> <span className="font-medium">{selectedTemplate.specimenType}</span></div>
                  <div><span className="text-muted-foreground">TAT:</span> <span className="font-medium">{selectedTemplate.turnaroundTime}</span></div>
                  <div><span className="text-muted-foreground">Version:</span> <span className="font-medium">v{selectedTemplate.version}</span></div>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">Parameters ({selectedTemplate.fields.length})</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b bg-muted/50">
                        <th className="text-left p-2">Parameter</th>
                        <th className="text-left p-2">Unit</th>
                        <th className="text-left p-2">Normal Range</th>
                        <th className="text-left p-2">Type</th>
                      </tr></thead>
                      <tbody>
                        {selectedTemplate.fields.map(f => (
                          <tr key={f.id} className="border-b">
                            <td className="p-2 font-medium">{f.name}</td>
                            <td className="p-2 text-muted-foreground">{f.unit || '-'}</td>
                            <td className="p-2 text-muted-foreground">{f.normalRangeMin && f.normalRangeMax ? `${f.normalRangeMin}-${f.normalRangeMax}` : f.normalRangeText || '-'}</td>
                            <td className="p-2"><Badge variant="outline">{f.dataType}</Badge></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Field Options */}
                <div>
                  <h4 className="font-semibold mb-2">Field Options</h4>
                  <p className="text-xs text-muted-foreground mb-3">
                    Configure dropdown options for result entry fields. These override the default range-based options.
                  </p>
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs">Select field</Label>
                      <Select value={viewFieldName} onValueChange={async (name) => {
                        setViewFieldName(name);
                        if (!selectedTemplate) return;
                        setLoadingViewOptions(true);
                        try {
                          const raw = await labService.getFieldOptions({
                            template: Number(selectedTemplate.id),
                            field_name: name,
                          });
                          setViewFieldOptions(Array.isArray(raw) ? raw.map(o => ({id: o.id, value: o.value})) : []);
                        } catch {
                          setViewFieldOptions([]);
                        } finally {
                          setLoadingViewOptions(false);
                        }
                      }}>
                        <SelectTrigger className="max-w-xs">
                          <SelectValue placeholder="Choose a field..." />
                        </SelectTrigger>
                        <SelectContent>
                          {selectedTemplate?.fields.map(f => (
                            <SelectItem key={f.id} value={f.name}>{f.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {viewFieldName && (
                      <div className="space-y-2 border rounded-md p-3">
                        {loadingViewOptions ? (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Loading...
                          </div>
                        ) : viewFieldOptions.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No custom options. Add some below.</p>
                        ) : (
                          <div className="space-y-1 max-w-xs">
                            {viewFieldOptions.map((opt, i) => (
                              <div key={opt.id} className="flex items-center gap-2 p-1.5 rounded border text-sm">
                                <GripVertical className="h-3 w-3 text-muted-foreground shrink-0" />
                                {editingOptionIdx === i ? (
                                  <Input
                                    value={editingOptionValue}
                                    onChange={e => setEditingOptionValue(e.target.value)}
                                    className="h-7 text-sm flex-1"
                                    autoFocus
                                    onKeyDown={async e => {
                                      if (e.key === 'Enter' && editingOptionValue.trim()) {
                                        e.preventDefault();
                                        try {
                                          await labService.updateFieldOption(opt.id, { value: editingOptionValue.trim() });
                                          setViewFieldOptions(prev => prev.map((o, idx) => idx === i ? {...o, value: editingOptionValue.trim()} : o));
                                          setEditingOptionIdx(null);
                                          toast.success('Option updated');
                                        } catch { toast.error('Failed to update option'); }
                                      }
                                      if (e.key === 'Escape') {
                                        setEditingOptionIdx(null);
                                      }
                                    }}
                                    onBlur={async () => {
                                      if (editingOptionValue.trim() && editingOptionValue.trim() !== opt.value) {
                                        try {
                                          await labService.updateFieldOption(opt.id, { value: editingOptionValue.trim() });
                                          setViewFieldOptions(prev => prev.map((o, idx) => idx === i ? {...o, value: editingOptionValue.trim()} : o));
                                          toast.success('Option updated');
                                        } catch { toast.error('Failed to update option'); }
                                      }
                                      setEditingOptionIdx(null);
                                    }}
                                  />
                                ) : (
                                  <span
                                    className="flex-1 cursor-pointer hover:text-foreground/80"
                                    onDoubleClick={() => {
                                      setEditingOptionIdx(i);
                                      setEditingOptionValue(opt.value);
                                    }}
                                    title="Double-click to edit"
                                  >
                                    {opt.value}
                                  </span>
                                )}
                                <button
                                  type="button"
                                  className="text-destructive hover:text-destructive/80"
                                  onClick={async () => {
                                    try {
                                      await labService.deleteFieldOption(opt.id);
                                      setViewFieldOptions(prev => prev.filter(o => o.id !== opt.id));
                                      toast.success('Option removed');
                                    } catch {
                                      toast.error('Failed to remove option');
                                    }
                                  }}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        <Separator />
                        <div className="flex items-center gap-2 max-w-xs">
                          <Input
                            value={newOptionValue}
                            onChange={e => setNewOptionValue(e.target.value)}
                            placeholder="New option value"
                            className="h-8 text-sm"
                            onKeyDown={async e => {
                              if (e.key === 'Enter' && newOptionValue.trim()) {
                                e.preventDefault();
                                try {
                                  const created = await labService.createFieldOption({
                                    template: Number(selectedTemplate!.id),
                                    field_name: viewFieldName,
                                    value: newOptionValue.trim(),
                                    sort_order: viewFieldOptions.length,
                                  });
                                  setViewFieldOptions(prev => [...prev, {id: created.id, value: created.value}]);
                                  setNewOptionValue('');
                                  toast.success('Option added');
                                } catch {
                                  toast.error('Failed to add option');
                                }
                              }
                            }}
                          />
                          <Button
                            size="sm"
                            className="h-8"
                            disabled={!newOptionValue.trim()}
                            onClick={async () => {
                              if (!newOptionValue.trim()) return;
                              try {
                                const created = await labService.createFieldOption({
                                  template: Number(selectedTemplate!.id),
                                  field_name: viewFieldName,
                                  value: newOptionValue.trim(),
                                  sort_order: viewFieldOptions.length,
                                });
                                setViewFieldOptions(prev => [...prev, {id: created.id, value: created.value}]);
                                setNewOptionValue('');
                                toast.success('Option added');
                              } catch {
                                toast.error('Failed to add option');
                              }
                            }}
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            Add
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => { setIsViewDialogOpen(false); setViewFieldName(''); setViewFieldOptions([]); }}>Close</Button>
              <Button onClick={() => { setIsViewDialogOpen(false); setViewFieldName(''); setViewFieldOptions([]); if (selectedTemplate) openEditDialog(selectedTemplate); }}>
                <Edit className="h-4 w-4 mr-2" />Edit
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Create/Edit Dialog */}
        <Dialog open={isCreateDialogOpen || isEditDialogOpen} onOpenChange={(open) => { if (!open) { setIsCreateDialogOpen(false); setIsEditDialogOpen(false); } }}>
          <DialogContent className="w-[95vw] sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {isEditDialogOpen ? <Edit className="h-5 w-5 text-amber-500" /> : <Plus className="h-5 w-5 text-emerald-500" />}
                {isEditDialogOpen ? 'Edit Template' : 'Create Template'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Test Name *</Label><Input value={formData.name} onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))} placeholder="Complete Blood Count" /></div>
                <div className="space-y-2"><Label>Code *</Label><Input value={formData.code} onChange={(e) => setFormData(p => ({ ...p, code: e.target.value.toUpperCase() }))} placeholder="CBC" /></div>
                <div className="space-y-2">
                  <Label>Category *</Label>
                  <Select value={formData.category} onValueChange={(v) => setFormData(p => ({ ...p, category: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {categories.filter(c => c !== 'All').map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>Specimen Type</Label><Input value={formData.specimenType} onChange={(e) => setFormData(p => ({ ...p, specimenType: e.target.value }))} placeholder="EDTA Blood" /></div>
                <div className="space-y-2"><Label>Turnaround Time</Label><Input value={formData.turnaroundTime} onChange={(e) => setFormData(p => ({ ...p, turnaroundTime: e.target.value }))} placeholder="2 hours" /></div>
              </div>
              <div className="space-y-2"><Label>Description</Label><Textarea value={formData.description} onChange={(e) => setFormData(p => ({ ...p, description: e.target.value }))} placeholder="Test description..." rows={2} /></div>

              {/* Fields */}
              <div className="space-y-3">
                <h4 className="font-semibold flex items-center gap-2"><ListPlus className="h-4 w-4" />Parameters ({formData.fields.length})</h4>
                {formData.fields.length > 0 && (
                  <div className="space-y-2">
                    {formData.fields.map((field, index) => (
                      <div
                        key={field.id}
                        draggable
                        onDragStart={() => handleFieldDragStart(index)}
                        onDragOver={(e) => handleFieldDragOver(e, index)}
                        onDragEnd={handleFieldDragEnd}
                        className={`flex items-center gap-2 p-2 rounded border bg-muted/50 ${
                          dragFieldIndex === index ? 'opacity-50 ring-2 ring-blue-400' : ''
                        }`}
                      >
                        <div className="cursor-grab active:cursor-grabbing text-muted-foreground/30 hover:text-muted-foreground flex-shrink-0">
                          <GripVertical className="h-4 w-4" />
                        </div>
                        <span className="text-xs text-muted-foreground w-5 text-right">{index + 1}.</span>
                        <span className="flex-1 font-medium text-sm">{field.name}</span>
                        <span className="text-xs text-muted-foreground w-20 truncate">{field.unit}</span>
                        <span className="text-xs text-muted-foreground w-24 truncate">{field.normalRangeMin && field.normalRangeMax ? `${field.normalRangeMin}-${field.normalRangeMax}` : field.normalRangeText || ''}</span>
                        <div className="flex items-center gap-0.5">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => moveFieldUp(index)} disabled={index === 0}>
                            <ChevronUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => moveFieldDown(index)} disabled={index === formData.fields.length - 1}>
                            <ChevronDown className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-blue-500" onClick={() => editField(field)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-rose-500" onClick={() => removeField(field.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="p-3 rounded-lg border-dashed border-2">
                  <div className="grid grid-cols-5 gap-2">
                    <Input placeholder="Parameter name" value={newField.name} onChange={(e) => setNewField(p => ({ ...p, name: e.target.value }))} />
                    <Input placeholder="Unit" value={newField.unit} onChange={(e) => setNewField(p => ({ ...p, unit: e.target.value }))} />
                    <Input placeholder="Min" value={newField.normalRangeMin} onChange={(e) => setNewField(p => ({ ...p, normalRangeMin: e.target.value }))} />
                    <Input placeholder="Max" value={newField.normalRangeMax} onChange={(e) => setNewField(p => ({ ...p, normalRangeMax: e.target.value }))} />
                    <Button onClick={addField} variant="outline"><Plus className="h-4 w-4" /></Button>
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setIsCreateDialogOpen(false); setIsEditDialogOpen(false); }}>Cancel</Button>
              <Button onClick={isEditDialogOpen ? handleEdit : handleCreate} disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : isEditDialogOpen ? <CheckCircle2 className="h-4 w-4 mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                {isEditDialogOpen ? 'Save Changes' : 'Create Template'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Dialog */}
        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Template?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{selectedTemplate?.name}"? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} disabled={isSubmitting} className="bg-rose-500 hover:bg-rose-600">
                {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Field Edit Dialog */}
        <Dialog open={isFieldEditDialogOpen} onOpenChange={setIsFieldEditDialogOpen}>
          <DialogContent className="w-[95vw] sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Edit className="h-5 w-5 text-blue-500" />
                Edit Parameter
              </DialogTitle>
              <DialogDescription>Modify parameter settings and normal ranges</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Parameter Name *</Label>
                  <Input
                    value={newField.name}
                    onChange={(e) => setNewField(p => ({ ...p, name: e.target.value }))}
                    placeholder="e.g., Glucose"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Unit</Label>
                  <Input
                    value={newField.unit}
                    onChange={(e) => setNewField(p => ({ ...p, unit: e.target.value }))}
                    placeholder="e.g., mg/dL"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Data Type</Label>
                <Select value={newField.dataType} onValueChange={(v: 'numeric' | 'text' | 'select') => setNewField(p => ({ ...p, dataType: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="numeric">Numeric</SelectItem>
                    <SelectItem value="text">Text</SelectItem>
                    <SelectItem value="select">Select Options</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {newField.dataType === 'select' && (
                <div className="space-y-2">
                  <Label>Options</Label>
                  <div className="space-y-1">
                    {newField.options.map((opt, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input
                          value={opt}
                          onChange={(e) => {
                            const next = [...newField.options];
                            next[i] = e.target.value;
                            setNewField(p => ({ ...p, options: next }));
                          }}
                          className="h-8 text-sm"
                        />
                        <Button
                          variant="ghost" size="sm" className="h-8 w-8 p-0 text-rose-500"
                          onClick={() => setNewField(p => ({ ...p, options: p.options.filter((_, idx) => idx !== i) }))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      variant="outline" size="sm" className="mt-1"
                      onClick={() => setNewField(p => ({ ...p, options: [...p.options, ''] }))}
                    >
                      <Plus className="h-3 w-3 mr-1" />Add option
                    </Button>
                  </div>
                </div>
              )}

              {newField.dataType === 'numeric' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Normal Range Min</Label>
                      <Input
                        type="number" step="any"
                        value={newField.normalRangeMin}
                        onChange={(e) => setNewField(p => ({ ...p, normalRangeMin: e.target.value }))}
                        placeholder="e.g., 70"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Normal Range Max</Label>
                      <Input
                        type="number" step="any"
                        value={newField.normalRangeMax}
                        onChange={(e) => setNewField(p => ({ ...p, normalRangeMax: e.target.value }))}
                        placeholder="e.g., 140"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Critical Min</Label>
                      <Input
                        type="number" step="any"
                        value={newField.criticalMin}
                        onChange={(e) => setNewField(p => ({ ...p, criticalMin: e.target.value }))}
                        placeholder="e.g., 50"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Critical Max</Label>
                      <Input
                        type="number" step="any"
                        value={newField.criticalMax}
                        onChange={(e) => setNewField(p => ({ ...p, criticalMax: e.target.value }))}
                        placeholder="e.g., 180"
                      />
                    </div>
                  </div>
                </>
              )}

              <div className="space-y-2">
                <Label>Normal Range Text (Optional)</Label>
                <Input
                  value={newField.normalRangeText}
                  onChange={(e) => setNewField(p => ({ ...p, normalRangeText: e.target.value }))}
                  placeholder="e.g., 70-140 mg/dL (Fasting)"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="required"
                  checked={newField.required}
                  onChange={(e) => setNewField(p => ({ ...p, required: e.target.checked }))}
                  className="rounded"
                />
                <Label htmlFor="required">Required field</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsFieldEditDialogOpen(false)}>Cancel</Button>
              <Button onClick={updateField} className="bg-blue-500 hover:bg-blue-600">
                <Edit className="h-4 w-4 mr-2" />
                Update Parameter
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
