"use client";

import { useState, useEffect, useCallback } from 'react';
import { DashboardLayout } from '@/components/shared/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { labService, type LabTemplate, type TemplateFieldOption } from '@/lib/services';
import {
  Search, Loader2, Plus, Trash2, ArrowLeft, Settings, GripVertical
} from 'lucide-react';

export default function ManageFieldOptionsPage() {
  const [templates, setTemplates] = useState<LabTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<LabTemplate | null>(null);
  const [fields, setFields] = useState<string[]>([]);
  const [selectedField, setSelectedField] = useState<string>('');
  const [options, setOptions] = useState<TemplateFieldOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [newOptionValue, setNewOptionValue] = useState('');
  const [saving, setSaving] = useState(false);

  // Fetch templates on mount
  const fetchTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    try {
      const { results } = await labService.getTemplates({ page_size: 200 });
      setTemplates(results);
    } catch {
      toast.error('Failed to load templates');
    } finally {
      setLoadingTemplates(false);
    }
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  // When template is selected, extract field names
  useEffect(() => {
    if (!selectedTemplate) {
      setFields([]);
      setSelectedField('');
      setOptions([]);
      return;
    }
    const nr = selectedTemplate.normal_range;
    if (!nr || typeof nr !== 'object') {
      setFields([]);
      return;
    }
    const keys = Object.keys(nr).filter(k => !k.startsWith('_'));
    setFields(keys);
    setSelectedField('');
    setOptions([]);
  }, [selectedTemplate]);

  // Fetch options when field is selected
  const fetchOptions = useCallback(async () => {
    if (!selectedTemplate || !selectedField) {
      setOptions([]);
      return;
    }
    setLoadingOptions(true);
    try {
      const data = await labService.getFieldOptions({
        template: selectedTemplate.id,
        field_name: selectedField,
      });
      setOptions(data);
    } catch {
      toast.error('Failed to load options');
    } finally {
      setLoadingOptions(false);
    }
  }, [selectedTemplate, selectedField]);

  useEffect(() => { fetchOptions(); }, [fetchOptions]);

  // Add a new option
  const addOption = async () => {
    if (!selectedTemplate || !selectedField || !newOptionValue.trim()) return;
    setSaving(true);
    try {
      await labService.createFieldOption({
        template: selectedTemplate.id,
        field_name: selectedField,
        value: newOptionValue.trim(),
        sort_order: options.length,
      });
      setNewOptionValue('');
      toast.success('Option added');
      await fetchOptions();
    } catch {
      toast.error('Failed to add option');
    } finally {
      setSaving(false);
    }
  };

  // Delete an option
  const deleteOption = async (id: number) => {
    try {
      await labService.deleteFieldOption(id);
      toast.success('Option removed');
      await fetchOptions();
    } catch {
      toast.error('Failed to remove option');
    }
  };

  const handleTemplateChange = (code: string) => {
    const tpl = templates.find(t => t.code === code) || null;
    setSelectedTemplate(tpl);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Settings className="h-6 w-6 text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Manage Result Types</h1>
            <p className="text-sm text-muted-foreground">
              Configure dropdown options for lab result fields
            </p>
          </div>
        </div>

        {/* Template selection */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">1. Select Template</CardTitle>
            <CardDescription>Choose a lab test template to manage its field options</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingTemplates ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading templates...
              </div>
            ) : (
              <Select value={selectedTemplate?.code || ''} onValueChange={handleTemplateChange}>
                <SelectTrigger className="max-w-md">
                  <SelectValue placeholder="Choose a template..." />
                </SelectTrigger>
                <SelectContent>
                  {templates.map(t => (
                    <SelectItem key={t.id} value={t.code}>
                      {t.name} ({t.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </CardContent>
        </Card>

        {/* Field selection */}
        {selectedTemplate && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">2. Select Field</CardTitle>
              <CardDescription>
                Choose a field in <strong>{selectedTemplate.name}</strong> to manage its dropdown options
              </CardDescription>
            </CardHeader>
            <CardContent>
              {fields.length === 0 ? (
                <p className="text-sm text-muted-foreground">No fields found in this template</p>
              ) : (
                <Select value={selectedField} onValueChange={setSelectedField}>
                  <SelectTrigger className="max-w-md">
                    <SelectValue placeholder="Choose a field..." />
                  </SelectTrigger>
                  <SelectContent>
                    {fields.map(f => (
                      <SelectItem key={f} value={f}>{f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </CardContent>
          </Card>
        )}

        {/* Options management */}
        {selectedField && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">3. Manage Options</CardTitle>
              <CardDescription>
                Options for <strong>{selectedField}</strong> in <strong>{selectedTemplate?.name}</strong>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {loadingOptions ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading options...
                </div>
              ) : (
                <>
                  {/* Existing options */}
                  {options.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No custom options yet. Add some below.
                    </p>
                  ) : (
                    <div className="space-y-2 max-w-md">
                      {options.map((opt) => (
                        <div key={opt.id} className="flex items-center gap-2 p-2 rounded-md border">
                          <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="flex-1 text-sm">{opt.value}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => deleteOption(opt.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  <Separator />

                  {/* Add new option */}
                  <div className="flex items-end gap-2 max-w-md">
                    <div className="flex-1">
                      <Label htmlFor="new-option" className="text-xs">Add new option</Label>
                      <Input
                        id="new-option"
                        value={newOptionValue}
                        onChange={(e) => setNewOptionValue(e.target.value)}
                        placeholder="Enter option value"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addOption();
                          }
                        }}
                      />
                    </div>
                    <Button onClick={addOption} disabled={saving || !newOptionValue.trim()}>
                      {saving ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      ) : (
                        <Plus className="h-4 w-4 mr-1" />
                      )}
                      Add
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Info card */}
        {options.length > 0 && (
          <Card className="bg-muted/50">
            <CardContent className="pt-4 text-sm text-muted-foreground">
              <p>
                These options will appear as a dropdown when entering results for{' '}
                <strong>{selectedTemplate?.name}</strong> / <strong>{selectedField}</strong>.
                The "Custom..." fallback is always available in case the value isn't listed.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
