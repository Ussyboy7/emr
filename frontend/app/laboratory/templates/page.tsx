"use client";

import { useState, useMemo, useEffect } from 'react';
import { StandardPagination } from '@/components/StandardPagination';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { labService, type LabTemplate as ApiLabTemplate } from '@/lib/services';
import {
  FileText, Search, Eye, Plus, Edit, Trash2, Copy, CheckCircle2,
  Loader2, Settings, ListPlus, FlaskConical, Activity, Clock
} from 'lucide-react';

interface TemplateField {
  id: string;
  name: string;
  unit: string;
  normalRangeMin?: string;
  normalRangeMax?: string;
  normalRangeText?: string;
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
  price: number;
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
    fields = Object.entries(apiTemplate.normal_range).map(([name, value]: [string, any]) => {
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
    category: apiTemplate.category || 'Chemistry',
    description: apiTemplate.description || '',
    fields,
    specimenType: apiTemplate.sample_type,
    turnaroundTime: apiTemplate.turnaround_time || '',
    price: apiTemplate.price || 0,
    status: apiTemplate.is_active !== false ? 'Active' : 'Inactive',
    createdAt: apiTemplate.created_at || new Date().toISOString().split('T')[0],
    updatedAt: apiTemplate.updated_at || new Date().toISOString().split('T')[0],
    version: (apiTemplate as any).version || 1,
  };
};

const categories = ['All', 'Hematology', 'Chemistry', 'Parasitology', 'Microbiology', 'Immunology'];

export default function TestTemplatesPage() {
  const [templates, setTemplates] = useState<TestTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('all');
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Dialog states
  const [selectedTemplate, setSelectedTemplate] = useState<TestTemplate | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states
  const [formData, setFormData] = useState({
    name: '', code: '', category: 'Chemistry', description: '',
    specimenType: '', turnaroundTime: '', price: 0,
    fields: [] as TemplateField[]
  });
  const [newField, setNewField] = useState({
    name: '', unit: '', normalRangeMin: '', normalRangeMax: '', dataType: 'numeric' as const
  });

  const filteredTemplates = useMemo(() => templates.filter(t => {
    const matchesSearch = t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.code.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === 'All' || t.category === categoryFilter;
    const matchesStatus = statusFilter === 'all' || t.status.toLowerCase() === statusFilter;
    return matchesSearch && matchesCategory && matchesStatus;
  }), [templates, searchQuery, categoryFilter, statusFilter]);

  // Paginated templates
  const paginatedTemplates = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredTemplates.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredTemplates, currentPage, itemsPerPage]);

  // Load templates from API
  useEffect(() => {
    loadTemplates();
  }, []);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, categoryFilter, statusFilter]);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      setError(null);
      const apiTemplates = await labService.getTemplates();
      const transformed = apiTemplates.map(transformTemplate);
      setTemplates(transformed);
    } catch (err: any) {
      setError(err.message || 'Failed to load templates');
      toast.error('Failed to load templates. Please try again.');
      console.error('Error loading templates:', err);
    } finally {
      setLoading(false);
    }
  };

  const stats = {
    total: templates.length,
    active: templates.filter(t => t.status === 'Active').length,
    hematology: templates.filter(t => t.category === 'Hematology').length,
    chemistry: templates.filter(t => t.category === 'Chemistry').length,
  };

  const getCategoryBadge = (category: string) => {
    switch (category) {
      case 'Hematology': return 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/50';
      case 'Chemistry': return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/50';
      case 'Parasitology': return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/50';
      case 'Microbiology': return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/50';
      default: return 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/50';
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
      dataType: newField.dataType,
      required: true
    };
    setFormData(prev => ({ ...prev, fields: [...prev.fields, field] }));
    setNewField({ name: '', unit: '', normalRangeMin: '', normalRangeMax: '', dataType: 'numeric' });
    toast.success('Field added');
  };

  const removeField = (fieldId: string) => {
    setFormData(prev => ({ ...prev, fields: prev.fields.filter(f => f.id !== fieldId) }));
  };

  const handleCreate = async () => {
    if (!formData.name || !formData.code || formData.fields.length === 0) {
      toast.error('Please fill in all required fields');
      return;
    }
    setIsSubmitting(true);

    try {
      // Convert fields array to normal_range JSON format
      const normalRange: Record<string, any> = {};
      formData.fields.forEach(field => {
        normalRange[field.name] = {
          unit: field.unit,
          min: field.normalRangeMin,
          max: field.normalRangeMax,
          range: field.normalRangeText,
          dataType: field.dataType,
          options: field.options,
          required: field.required,
        };
      });

      const templateData = {
        name: formData.name,
        code: formData.code,
        category: formData.category,
        description: formData.description,
        sample_type: formData.specimenType,
        turnaround_time: formData.turnaroundTime,
        price: formData.price,
        normal_range: normalRange,
        is_active: true,
      };

      const created = await labService.createTemplate(templateData);
      const transformed = transformTemplate(created);
      setTemplates(prev => [...prev, transformed]);
      toast.success(`Template "${formData.name}" created`);
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

      // Convert fields array to normal_range JSON format
      const normalRange: Record<string, any> = {};
      formData.fields.forEach(field => {
        normalRange[field.name] = {
          unit: field.unit,
          min: field.normalRangeMin,
          max: field.normalRangeMax,
          range: field.normalRangeText,
          dataType: field.dataType,
          options: field.options,
          required: field.required,
        };
      });

      const templateData = {
        name: formData.name,
        code: formData.code,
        category: formData.category,
        description: formData.description,
        sample_type: formData.specimenType,
        turnaround_time: formData.turnaroundTime,
        price: formData.price,
        normal_range: normalRange,
        is_active: selectedTemplate?.status === 'Active' || true,
      };

      const updated = await labService.updateTemplate(templateId, templateData);
      const transformed = transformTemplate(updated);
      setTemplates(prev => prev.map(t => t.id === selectedTemplate.id ? transformed : t));
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
      setTemplates(prev => prev.filter(t => t.id !== selectedTemplate.id));
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
      const duplicateData = {
        name: `${original.name} (Copy)`,
        code: `${original.code}_COPY`,
        category: original.category,
        description: original.description,
        sample_type: original.sample_type,
        turnaround_time: original.turnaround_time,
        price: original.price,
        fields: (original as any).fields,
        is_active: false, // Start as inactive
      };

      const created = await labService.createTemplate(duplicateData);
      const transformed = transformTemplate(created);
      setTemplates(prev => [...prev, transformed]);
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
      const updated = await labService.updateTemplate(templateId, { is_active: newStatus });
      const transformed = transformTemplate(updated);
      setTemplates(prev => prev.map(t => t.id === template.id ? transformed : t));
      toast.success(`Template ${template.status === 'Active' ? 'deactivated' : 'activated'}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to update template status');
      console.error('Error toggling template status:', err);
    }
  };

  const resetForm = () => {
    setFormData({ name: '', code: '', category: 'Chemistry', description: '', specimenType: '', turnaroundTime: '', price: 0, fields: [] });
    setNewField({ name: '', unit: '', normalRangeMin: '', normalRangeMax: '', dataType: 'numeric' });
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
      price: template.price, 
      fields: template.fields.map(f => ({ ...f })) // Create a copy to avoid reference issues
    });
    setIsEditDialogOpen(true);
  };
  const openDeleteDialog = (template: TestTemplate) => { setSelectedTemplate(template); setIsDeleteDialogOpen(true); };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
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
                  <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{stats.total}</p>
                </div>
                <FileText className="h-8 w-8 text-blue-400" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-emerald-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Active</p>
                  <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{stats.active}</p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-emerald-400" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-rose-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Hematology</p>
                  <p className="text-3xl font-bold text-rose-600 dark:text-rose-400">{stats.hematology}</p>
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
                  <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">{stats.chemistry}</p>
                </div>
                <FlaskConical className="h-8 w-8 text-amber-400" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search templates..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
              </div>
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
          ) : filteredTemplates.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No templates found</p>
            </CardContent></Card>
          ) : (
            paginatedTemplates.map(template => (
              <Card key={template.id} className={`border-l-4 hover:shadow-md transition-shadow ${
                template.status === 'Inactive' ? 'border-l-gray-400 opacity-60' :
                template.category === 'Hematology' ? 'border-l-rose-500' :
                template.category === 'Chemistry' ? 'border-l-amber-500' :
                template.category === 'Microbiology' ? 'border-l-emerald-500' : 'border-l-blue-500'
              }`}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    {/* Avatar */}
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                      template.category === 'Hematology' ? 'bg-rose-100 dark:bg-rose-900/30' :
                      template.category === 'Chemistry' ? 'bg-amber-100 dark:bg-amber-900/30' :
                      template.category === 'Microbiology' ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-blue-100 dark:bg-blue-900/30'
                    }`}>
                      <FlaskConical className={`h-4 w-4 ${
                        template.category === 'Hematology' ? 'text-rose-600' :
                        template.category === 'Chemistry' ? 'text-amber-600' :
                        template.category === 'Microbiology' ? 'text-emerald-600' : 'text-blue-600'
                      }`} />
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
                        <span>₦{template.price.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Pagination */}
        {filteredTemplates.length > 0 && (
          <Card className="p-4">
            <StandardPagination
              currentPage={currentPage}
              totalItems={filteredTemplates.length}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={setItemsPerPage}
              itemName="templates"
            />
          </Card>
        )}

        {/* View Dialog */}
        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className="sm:max-w-[600px]">
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
                  <div><span className="text-muted-foreground">Price:</span> <span className="font-medium">₦{selectedTemplate.price.toLocaleString()}</span></div>
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
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>Close</Button>
              <Button onClick={() => { setIsViewDialogOpen(false); if (selectedTemplate) openEditDialog(selectedTemplate); }}>
                <Edit className="h-4 w-4 mr-2" />Edit
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Create/Edit Dialog */}
        <Dialog open={isCreateDialogOpen || isEditDialogOpen} onOpenChange={(open) => { if (!open) { setIsCreateDialogOpen(false); setIsEditDialogOpen(false); } }}>
          <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
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
                <div className="space-y-2"><Label>Price (₦)</Label><Input type="number" value={formData.price} onChange={(e) => setFormData(p => ({ ...p, price: Number(e.target.value) }))} placeholder="3500" /></div>
              </div>
              <div className="space-y-2"><Label>Description</Label><Textarea value={formData.description} onChange={(e) => setFormData(p => ({ ...p, description: e.target.value }))} placeholder="Test description..." rows={2} /></div>

              {/* Fields */}
              <div className="space-y-3">
                <h4 className="font-semibold flex items-center gap-2"><ListPlus className="h-4 w-4" />Parameters ({formData.fields.length})</h4>
                {formData.fields.length > 0 && (
                  <div className="space-y-2">
                    {formData.fields.map(field => (
                      <div key={field.id} className="flex items-center gap-2 p-2 rounded border bg-muted/50">
                        <span className="flex-1 font-medium">{field.name}</span>
                        <span className="text-sm text-muted-foreground">{field.unit}</span>
                        <span className="text-sm text-muted-foreground">{field.normalRangeMin && field.normalRangeMax ? `${field.normalRangeMin}-${field.normalRangeMax}` : ''}</span>
                        <Button variant="ghost" size="sm" onClick={() => removeField(field.id)} className="text-rose-500">
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
      </div>
    </DashboardLayout>
  );
}

