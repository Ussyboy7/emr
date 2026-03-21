"use client";

import { useState, useMemo, useEffect, useCallback } from 'react';
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
import { radiologyService, type RadiologyTemplate as ApiRadiologyTemplate } from '@/lib/services';
import {
  FileText, Search, Eye, Plus, Edit, Trash2, Copy, CheckCircle2,
  Loader2, Settings, ListPlus, Scan, Activity, Clock,
  Heart, Radio
} from 'lucide-react';

interface RadiologyTemplate {
  id: string;
  name: string;
  code: string;
  category: string;
  subcategory?: string;
  description?: string;
  body_part?: string;
  modality?: string;
  radiation_exposure?: string;
  preparation_required?: string;
  indications?: string;
  contraindications?: string;
  turnaround_time?: string;
  report_template?: any;
  is_active: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
}

// Transform API template to frontend format
const transformTemplate = (apiTemplate: ApiRadiologyTemplate): RadiologyTemplate => {
  return {
    id: apiTemplate.id.toString(),
    name: apiTemplate.name,
    code: apiTemplate.code,
    category: apiTemplate.category || 'xray',
    subcategory: apiTemplate.subcategory,
    description: apiTemplate.description,
    body_part: apiTemplate.body_part,
    modality: apiTemplate.modality,
    radiation_exposure: apiTemplate.radiation_exposure,
    preparation_required: apiTemplate.preparation_required,
    indications: apiTemplate.indications,
    contraindications: apiTemplate.contraindications,
    turnaround_time: apiTemplate.turnaround_time,
    report_template: apiTemplate.report_template,
    is_active: apiTemplate.is_active,
    createdAt: apiTemplate.created_at || new Date().toISOString().split('T')[0],
    updatedAt: apiTemplate.updated_at || new Date().toISOString().split('T')[0],
    version: 1, // Radiology templates don't have versions like lab templates
  };
};

const categories = ['All', 'xray', 'ct', 'mri', 'ultrasound', 'mammography', 'fluoroscopy', 'angiography', 'nuclear', 'dental', 'interventional'];

export default function RadiologyTemplatesPage() {
  const [templates, setTemplates] = useState<RadiologyTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('all');
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Dialog states
  const [selectedTemplate, setSelectedTemplate] = useState<RadiologyTemplate | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states
  const [formData, setFormData] = useState({
    name: '', code: '', category: 'xray', subcategory: '', description: '',
    body_part: '', modality: '', radiation_exposure: 'moderate',
    preparation_required: '', indications: '', contraindications: '', turnaround_time: ''
  });

  const filteredTemplates = useMemo(() => templates.filter(t => {
    const matchesSearch = t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.body_part && t.body_part.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory = categoryFilter === 'All' || t.category === categoryFilter;
    const matchesStatus = statusFilter === 'all' ||
      (statusFilter === 'active' && t.is_active) ||
      (statusFilter === 'inactive' && !t.is_active);
    return matchesSearch && matchesCategory && matchesStatus;
  }), [templates, searchQuery, categoryFilter, statusFilter]);

  // Paginated templates
  const paginatedTemplates = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredTemplates.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredTemplates, currentPage, itemsPerPage]);

  // Load templates function - memoized
  const loadTemplates = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const apiTemplates = await radiologyService.getTemplates({ page_size: 1000 });
      const transformed = apiTemplates.results.map(transformTemplate);
      setTemplates(transformed);
    } catch (err: any) {
      setError(err.message || 'Failed to load templates');
      toast.error('Failed to load templates. Please try again.');
      console.error('Error loading templates:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load templates from API on mount
  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, categoryFilter, statusFilter]);

  const stats = {
    total: templates.length,
    active: templates.filter(t => t.is_active).length,
    // Top categories by usage - include doppler as ultrasound
    xray: templates.filter(t => t.category === 'xray').length,
    ultrasound: templates.filter(t => t.category === 'ultrasound' || t.category === 'doppler').length,
    mri: templates.filter(t => t.category === 'mri').length,
    ct: templates.filter(t => t.category === 'ct-scan').length,
  };

  const getCategoryBadge = (category: string) => {
    switch (category) {
      case 'xray': return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/50';
      case 'ct': return 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/50';
      case 'mri': return 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/50';
      case 'ultrasound':
      case 'doppler': return 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/50';
      case 'mammography': return 'bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/50';
      case 'fluoroscopy': return 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/50';
      case 'angiography': return 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/50';
      case 'nuclear': return 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/50';
      case 'dental': return 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/50';
      case 'interventional': return 'bg-red-700/10 text-red-700 dark:text-red-300 border-red-700/50';
      default: return 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/50';
    }
  };


  const handleCreate = async () => {
    if (!formData.name || !formData.code) {
      toast.error('Please fill in all required fields');
      return;
    }
    setIsSubmitting(true);

    try {
      const templateData = {
        name: formData.name,
        code: formData.code,
        category: formData.category,
        subcategory: formData.subcategory || undefined,
        description: formData.description || undefined,
        body_part: formData.body_part || undefined,
        modality: formData.modality || undefined,
        radiation_exposure: formData.radiation_exposure || 'moderate',
        preparation_required: formData.preparation_required || undefined,
        indications: formData.indications || undefined,
        contraindications: formData.contraindications || undefined,
        turnaround_time: formData.turnaround_time || undefined,
        is_active: true,
      };

      const created = await radiologyService.createTemplate(templateData as any);
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

      const templateData = {
        name: formData.name,
        code: formData.code,
        category: formData.category,
        subcategory: formData.subcategory || undefined,
        description: formData.description || undefined,
        body_part: formData.body_part || undefined,
        modality: formData.modality || undefined,
        radiation_exposure: formData.radiation_exposure || 'moderate',
        preparation_required: formData.preparation_required || undefined,
        indications: formData.indications || undefined,
        contraindications: formData.contraindications || undefined,
        turnaround_time: formData.turnaround_time || undefined,
        is_active: selectedTemplate.is_active,
      };

      const updated = await radiologyService.updateTemplate(templateId, templateData as any);
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

      await radiologyService.deleteTemplate(templateId);
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

  const handleDuplicate = async (template: RadiologyTemplate) => {
    try {
      setIsSubmitting(true);
      const templateId = parseInt(template.id);
      if (isNaN(templateId)) {
        toast.error('Invalid template ID');
        return;
      }

      // Get the original template
      const original = await radiologyService.getTemplate(templateId);

      // Create a duplicate with modified name and code
      const duplicateData = {
        name: `${original.name} (Copy)`,
        code: `${original.code}_COPY`,
        category: original.category,
        subcategory: original.subcategory,
        description: original.description,
        body_part: original.body_part,
        modality: original.modality,
        radiation_exposure: original.radiation_exposure,
        preparation_required: original.preparation_required,
        indications: original.indications,
        contraindications: original.contraindications,
        turnaround_time: original.turnaround_time,
        report_template: original.report_template,
        is_active: false, // Start as inactive
      };

      const created = await radiologyService.createTemplate(duplicateData);
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

  const toggleStatus = async (template: RadiologyTemplate) => {
    try {
      const templateId = parseInt(template.id);
      if (isNaN(templateId)) {
        toast.error('Invalid template ID');
        return;
      }

      const updated = await radiologyService.toggleTemplateStatus(templateId);
      const transformed = transformTemplate(updated);
      setTemplates(prev => prev.map(t => t.id === template.id ? transformed : t));
      toast.success(`Template ${template.is_active ? 'deactivated' : 'activated'}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to update template status');
      console.error('Error toggling template status:', err);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '', code: '', category: 'xray', subcategory: '', description: '',
      body_part: '', modality: '', radiation_exposure: 'moderate',
      preparation_required: '', indications: '', contraindications: '', turnaround_time: ''
    });
  };

  const openViewDialog = (template: RadiologyTemplate) => { setSelectedTemplate(template); setIsViewDialogOpen(true); };
  const openEditDialog = (template: RadiologyTemplate) => {
    setSelectedTemplate(template);
    setFormData({
      name: template.name,
      code: template.code,
      category: template.category,
      subcategory: template.subcategory || '',
      description: template.description || '',
      body_part: template.body_part || '',
      modality: template.modality || '',
      radiation_exposure: template.radiation_exposure || 'moderate',
      preparation_required: template.preparation_required || '',
      indications: template.indications || '',
      contraindications: template.contraindications || '',
      turnaround_time: template.turnaround_time || ''
    });
    setIsEditDialogOpen(true);
  };
  const openDeleteDialog = (template: RadiologyTemplate) => { setSelectedTemplate(template); setIsDeleteDialogOpen(true); };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
              <Radio className="h-8 w-8 text-blue-500" />
              Study Templates
            </h1>
            <p className="text-muted-foreground mt-1">Manage radiology study templates and procedures</p>
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
          <Card className="border-l-4 border-l-emerald-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Active</p>
                  <p className="text-2xl sm:text-3xl font-bold text-emerald-600 dark:text-emerald-400">{stats.active}</p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-emerald-400" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">X-Ray</p>
                  <p className="text-2xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400">{stats.xray}</p>
                </div>
                <Radio className="h-8 w-8 text-blue-400" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-red-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">CT Scan</p>
                  <p className="text-2xl sm:text-3xl font-bold text-red-600 dark:text-red-400">{stats.ct}</p>
                </div>
                <Scan className="h-8 w-8 text-red-400" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-indigo-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">MRI</p>
                  <p className="text-2xl sm:text-3xl font-bold text-indigo-600 dark:text-indigo-400">{stats.mri}</p>
                </div>
                <Activity className="h-8 w-8 text-indigo-400" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-green-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Ultrasound</p>
                  <p className="text-2xl sm:text-3xl font-bold text-green-600 dark:text-green-400">{stats.ultrasound}</p>
                </div>
                <Scan className="h-8 w-8 text-green-400" />
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
          ) : filteredTemplates.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No templates found</p>
            </CardContent></Card>
          ) : (
            paginatedTemplates.map(template => (
              <Card key={template.id} className={`border-l-4 hover:shadow-md transition-shadow ${
                !template.is_active ? 'border-l-gray-400 opacity-60' :
                template.category === 'xray' ? 'border-l-blue-500' :
                template.category === 'ct' ? 'border-l-red-500' :
                template.category === 'mri' ? 'border-l-indigo-500' :
                template.category === 'ultrasound' ? 'border-l-green-500' :
                template.category === 'mammography' ? 'border-l-pink-500' :
                template.category === 'fluoroscopy' ? 'border-l-yellow-500' :
                template.category === 'angiography' ? 'border-l-purple-500' :
                template.category === 'nuclear' ? 'border-l-orange-500' :
                template.category === 'dental' ? 'border-l-teal-500' :
                template.category === 'interventional' ? 'border-l-red-700' : 'border-l-slate-500'
              }`}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    {/* Avatar */}
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                      template.category === 'xray' ? 'bg-blue-100 dark:bg-blue-900/30' :
                      template.category === 'ct' ? 'bg-red-100 dark:bg-red-900/30' :
                      template.category === 'mri' ? 'bg-indigo-100 dark:bg-indigo-900/30' :
                      template.category === 'ultrasound' ? 'bg-green-100 dark:bg-green-900/30' :
                      template.category === 'mammography' ? 'bg-pink-100 dark:bg-pink-900/30' :
                      template.category === 'fluoroscopy' ? 'bg-yellow-100 dark:bg-yellow-900/30' :
                      template.category === 'angiography' ? 'bg-purple-100 dark:bg-purple-900/30' :
                      template.category === 'nuclear' ? 'bg-orange-100 dark:bg-orange-900/30' :
                      template.category === 'dental' ? 'bg-teal-100 dark:bg-teal-900/30' :
                      template.category === 'interventional' ? 'bg-red-700/30 dark:bg-red-900/50' : 'bg-slate-100 dark:bg-slate-900/30'
                    }`}>
                      {template.category === 'xray' ? <Radio className="h-4 w-4 text-blue-600" /> :
                       template.category === 'ct' ? <Scan className="h-4 w-4 text-red-600" /> :
                       template.category === 'mri' ? <Activity className="h-4 w-4 text-indigo-600" /> :
                       template.category === 'ultrasound' ? <Scan className="h-4 w-4 text-green-600" /> :
                       <Radio className="h-4 w-4 text-slate-600" />}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      {/* Row 1: Name + Badges + Actions */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <span className="font-semibold text-foreground truncate">{template.name}</span>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{template.code}</Badge>
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getCategoryBadge(template.category)}`}>{template.category}</Badge>
                          {!template.is_active && <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-gray-500">Inactive</Badge>}
                          {template.radiation_exposure === 'high' && <Badge variant="outline" className="text-[9px] px-1 py-0 text-amber-600">High Rad</Badge>}
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
                        <span>{template.body_part || 'N/A'}</span>
                        <span>•</span>
                        <span>{template.modality || 'N/A'}</span>
                        {template.turnaround_time && (
                          <>
                            <span>•</span>
                            <span>TAT: {template.turnaround_time}</span>
                          </>
                        )}
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
          <DialogContent className="w-[95vw] sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-amber-500" />Template Details</DialogTitle>
              <DialogDescription>{selectedTemplate?.name}</DialogDescription>
            </DialogHeader>
            {selectedTemplate && (
              <div className="space-y-4 py-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline">{selectedTemplate.code}</Badge>
                  <Badge variant="outline" className={getCategoryBadge(selectedTemplate.category)}>{selectedTemplate.category}</Badge>
                  {selectedTemplate.subcategory && <Badge variant="outline">{selectedTemplate.subcategory}</Badge>}
                  {!selectedTemplate.is_active && <Badge variant="outline" className="text-gray-500">Inactive</Badge>}
                  {selectedTemplate.radiation_exposure === 'high' && <Badge variant="outline" className="text-amber-600">High Radiation</Badge>}
                </div>

                <p className="text-sm text-muted-foreground">{selectedTemplate.description}</p>

                <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-muted/50 text-sm">
                  <div><span className="text-muted-foreground">Body Part:</span> <span className="font-medium">{selectedTemplate.body_part || 'N/A'}</span></div>
                  <div><span className="text-muted-foreground">Modality:</span> <span className="font-medium">{selectedTemplate.modality || 'N/A'}</span></div>
                  <div><span className="text-muted-foreground">Turnaround Time:</span> <span className="font-medium">{selectedTemplate.turnaround_time || 'N/A'}</span></div>
                  <div><span className="text-muted-foreground">Radiation:</span> <span className="font-medium">{selectedTemplate.radiation_exposure || 'N/A'}</span></div>
                </div>

                {selectedTemplate.preparation_required && (
                  <div>
                    <h4 className="font-semibold mb-2">Patient Preparation</h4>
                    <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded">{selectedTemplate.preparation_required}</p>
                  </div>
                )}

                {selectedTemplate.indications && (
                  <div>
                    <h4 className="font-semibold mb-2">Clinical Indications</h4>
                    <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded">{selectedTemplate.indications}</p>
                  </div>
                )}

                {selectedTemplate.contraindications && (
                  <div>
                    <h4 className="font-semibold mb-2">Contraindications</h4>
                    <p className="text-sm text-muted-foreground bg-rose-50 dark:bg-rose-900/20 p-3 rounded border border-rose-200 dark:border-rose-800">{selectedTemplate.contraindications}</p>
                  </div>
                )}
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
          <DialogContent className="w-[95vw] sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {isEditDialogOpen ? <Edit className="h-5 w-5 text-amber-500" /> : <Plus className="h-5 w-5 text-emerald-500" />}
                {isEditDialogOpen ? 'Edit Investigation' : 'Create Investigation'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Investigation Name *</Label><Input value={formData.name} onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))} placeholder="Chest X-Ray PA" /></div>
                <div className="space-y-2"><Label>Code *</Label><Input value={formData.code} onChange={(e) => setFormData(p => ({ ...p, code: e.target.value.toUpperCase() }))} placeholder="CXR-PA" /></div>
                <div className="space-y-2">
                  <Label>Category *</Label>
                  <Select value={formData.category} onValueChange={(v) => setFormData(p => ({ ...p, category: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {categories.filter(c => c !== 'All').map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>Body Part</Label><Input value={formData.body_part} onChange={(e) => setFormData(p => ({ ...p, body_part: e.target.value }))} placeholder="Chest" /></div>
                <div className="space-y-2"><Label>Modality</Label><Input value={formData.modality} onChange={(e) => setFormData(p => ({ ...p, modality: e.target.value }))} placeholder="X-Ray" /></div>
                <div className="space-y-2"><Label>Turnaround Time</Label><Input value={formData.turnaround_time} onChange={(e) => setFormData(p => ({ ...p, turnaround_time: e.target.value }))} placeholder="2 hours" /></div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <Label>Radiation Exposure</Label>
                  <Select value={formData.radiation_exposure} onValueChange={(v: 'none' | 'low' | 'moderate' | 'high') => setFormData(p => ({ ...p, radiation_exposure: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Radiation</SelectItem>
                      <SelectItem value="low">Low Radiation</SelectItem>
                      <SelectItem value="moderate">Moderate Radiation</SelectItem>
                      <SelectItem value="high">High Radiation</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2"><Label>Description</Label><Textarea value={formData.description} onChange={(e) => setFormData(p => ({ ...p, description: e.target.value }))} placeholder="Detailed description of the investigation..." rows={2} /></div>

              <div className="space-y-2"><Label>Patient Preparation</Label><Textarea value={formData.preparation_required} onChange={(e) => setFormData(p => ({ ...p, preparation_required: e.target.value }))} placeholder="Patient preparation instructions..." rows={2} /></div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Clinical Indications</Label><Textarea value={formData.indications} onChange={(e) => setFormData(p => ({ ...p, indications: e.target.value }))} placeholder="When to order this investigation..." rows={2} /></div>
                <div className="space-y-2"><Label>Contraindications</Label><Textarea value={formData.contraindications} onChange={(e) => setFormData(p => ({ ...p, contraindications: e.target.value }))} placeholder="When NOT to order this investigation..." rows={2} /></div>
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
