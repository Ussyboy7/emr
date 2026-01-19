"""
Django management command to seed the database with comprehensive lab test templates.
Run with: python manage.py seed_lab_templates
"""
from django.core.management.base import BaseCommand
from laboratory.models import LabTemplate


class Command(BaseCommand):
    help = 'Seed the database with comprehensive lab test templates with parameters'

    def handle(self, *args, **options):
        # Note: Not clearing existing templates due to foreign key constraints with LabTest records
        # Existing templates will be updated, new ones will be created
        self.stdout.write('Updating/creating lab templates (preserving existing data)')

        templates_data = [
            # ==================== HEMATOLOGY TESTS (50+ templates) ====================
            {
                'name': 'Complete Blood Count (CBC)',
                'code': 'CBC',
                'category': 'hematology',
                'sample_type': 'EDTA Blood',
                'description': 'Complete blood count including red blood cells, white blood cells, platelets, hemoglobin, and hematocrit',
                'turnaround_time': '1 hour',
                'normal_range': {
                    'Hemoglobin (Hb)': {'unit': 'g/dL', 'min': '12.0', 'max': '16.0', 'dataType': 'numeric', 'required': True},
                    'Hematocrit (Hct)': {'unit': '%', 'min': '36', 'max': '48', 'dataType': 'numeric', 'required': True},
                    'White Blood Cell Count (WBC)': {'unit': 'x10³/µL', 'min': '4.0', 'max': '11.0', 'dataType': 'numeric', 'required': True},
                    'Red Blood Cell Count (RBC)': {'unit': 'x10⁶/µL', 'min': '4.0', 'max': '5.5', 'dataType': 'numeric', 'required': True},
                    'Platelet Count': {'unit': 'x10³/µL', 'min': '150', 'max': '450', 'dataType': 'numeric', 'required': True},
                    'MCV': {'unit': 'fL', 'min': '80', 'max': '100', 'dataType': 'numeric', 'required': False},
                    'MCH': {'unit': 'pg', 'min': '27', 'max': '32', 'dataType': 'numeric', 'required': False},
                    'MCHC': {'unit': 'g/dL', 'min': '32', 'max': '36', 'dataType': 'numeric', 'required': False},
                }
            },
            {
                'name': 'Full Blood Count (FBC)',
                'code': 'FBC',
                'category': 'hematology',
                'sample_type': 'EDTA Blood',
                'description': 'Full blood count - comprehensive blood analysis (alternative name for CBC)',
                'turnaround_time': '1 hour',
                'normal_range': {
                    'Haemoglobin (Hb)': {'unit': 'g/dL', 'min': '12.0', 'max': '16.0', 'dataType': 'numeric', 'required': True},
                    'Haematocrit (Hct)': {'unit': '%', 'min': '36', 'max': '48', 'dataType': 'numeric', 'required': True},
                    'White Blood Cell Count (WBC)': {'unit': 'x10³/µL', 'min': '4.0', 'max': '11.0', 'dataType': 'numeric', 'required': True},
                    'Red Blood Cell Count (RBC)': {'unit': 'x10⁶/µL', 'min': '4.0', 'max': '5.5', 'dataType': 'numeric', 'required': True},
                    'Platelet Count': {'unit': 'x10³/µL', 'min': '150', 'max': '450', 'dataType': 'numeric', 'required': True},
                    'MCV': {'unit': 'fL', 'min': '80', 'max': '100', 'dataType': 'numeric', 'required': False},
                    'MCH': {'unit': 'pg', 'min': '27', 'max': '32', 'dataType': 'numeric', 'required': False},
                    'MCHC': {'unit': 'g/dL', 'min': '32', 'max': '36', 'dataType': 'numeric', 'required': False},
                }
            },
            {
                'name': 'White Blood Cell Differential',
                'code': 'DIFF',
                'category': 'hematology',
                'sample_type': 'EDTA Blood',
                'description': 'Differential count of white blood cell types',
                'turnaround_time': '2 hours',
                'normal_range': {
                    'Neutrophils': {'unit': '%', 'min': '50', 'max': '70', 'dataType': 'numeric', 'required': True},
                    'Lymphocytes': {'unit': '%', 'min': '20', 'max': '40', 'dataType': 'numeric', 'required': True},
                    'Monocytes': {'unit': '%', 'min': '2', 'max': '8', 'dataType': 'numeric', 'required': True},
                    'Eosinophils': {'unit': '%', 'min': '1', 'max': '4', 'dataType': 'numeric', 'required': True},
                    'Basophils': {'unit': '%', 'min': '0', 'max': '1', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Erythrocyte Sedimentation Rate (ESR)',
                'code': 'ESR',
                'category': 'hematology',
                'sample_type': 'EDTA Blood',
                'description': 'Rate at which red blood cells settle in anticoagulated blood',
                'turnaround_time': '1 hour',
                'normal_range': {
                    'ESR': {'unit': 'mm/hr', 'min': '0', 'max': '20', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Peripheral Blood Smear',
                'code': 'PBS',
                'category': 'hematology',
                'sample_type': 'EDTA Blood',
                'description': 'Microscopic examination of blood cells morphology',
                'turnaround_time': '4 hours',
                'normal_range': {
                    'Red Cell Morphology': {'unit': '', 'range': 'Normal morphology', 'dataType': 'text', 'required': True},
                    'White Cell Morphology': {'unit': '', 'range': 'Normal morphology', 'dataType': 'text', 'required': True},
                    'Platelet Morphology': {'unit': '', 'range': 'Normal morphology', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Reticulocyte Count',
                'code': 'RETIC',
                'category': 'hematology',
                'sample_type': 'EDTA Blood',
                'description': 'Percentage of immature red blood cells',
                'turnaround_time': '2 hours',
                'normal_range': {
                    'Reticulocyte Count': {'unit': '%', 'min': '0.5', 'max': '2.0', 'dataType': 'numeric', 'required': True},
                    'Absolute Reticulocyte Count': {'unit': 'x10⁶/µL', 'min': '25', 'max': '75', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Hemoglobin Electrophoresis',
                'code': 'HBE',
                'category': 'hematology',
                'sample_type': 'EDTA Blood',
                'description': 'Separation and quantification of hemoglobin variants',
                'turnaround_time': '24 hours',
                'normal_range': {
                    'HbA': {'unit': '%', 'min': '95', 'max': '98', 'dataType': 'numeric', 'required': True},
                    'HbA2': {'unit': '%', 'min': '2.0', 'max': '3.5', 'dataType': 'numeric', 'required': True},
                    'HbF': {'unit': '%', 'min': '0', 'max': '1.0', 'dataType': 'numeric', 'required': True},
                    'HbS': {'unit': '%', 'min': '0', 'max': '0', 'dataType': 'numeric', 'required': False},
                }
            },
            {
                'name': 'Bleeding Time (Ivy Method)',
                'code': 'BT-IVY',
                'category': 'hematology',
                'sample_type': 'Whole Blood',
                'description': 'Time taken for bleeding to stop after standardized incision',
                'turnaround_time': '10 minutes',
                'normal_range': {
                    'Bleeding Time': {'unit': 'minutes', 'min': '2', 'max': '8', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Clotting Time (Lee-White)',
                'code': 'CT-LW',
                'category': 'hematology',
                'sample_type': 'Whole Blood',
                'description': 'Time required for blood to clot in glass tubes',
                'turnaround_time': '15 minutes',
                'normal_range': {
                    'Clotting Time': {'unit': 'minutes', 'min': '5', 'max': '15', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Prothrombin Time (PT)',
                'code': 'PT',
                'category': 'hematology',
                'sample_type': 'Citrated Plasma',
                'description': 'Time required for plasma to clot after addition of tissue factor',
                'turnaround_time': '30 minutes',
                'normal_range': {
                    'PT': {'unit': 'seconds', 'min': '11', 'max': '13', 'dataType': 'numeric', 'required': True},
                    'INR': {'unit': '', 'min': '0.8', 'max': '1.1', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Activated Partial Thromboplastin Time (APTT)',
                'code': 'APTT',
                'category': 'hematology',
                'sample_type': 'Citrated Plasma',
                'description': 'Time required for plasma to clot after activation of intrinsic pathway',
                'turnaround_time': '30 minutes',
                'normal_range': {
                    'APTT': {'unit': 'seconds', 'min': '25', 'max': '35', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Fibrinogen Level',
                'code': 'FIB',
                'category': 'hematology',
                'sample_type': 'Citrated Plasma',
                'description': 'Plasma fibrinogen concentration',
                'turnaround_time': '1 hour',
                'normal_range': {
                    'Fibrinogen': {'unit': 'mg/dL', 'min': '200', 'max': '400', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'D-Dimer',
                'code': 'DDIMER',
                'category': 'hematology',
                'sample_type': 'Citrated Plasma',
                'description': 'Degradation product of cross-linked fibrin',
                'turnaround_time': '1 hour',
                'normal_range': {
                    'D-Dimer': {'unit': 'µg/mL', 'min': '0', 'max': '0.5', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Iron Studies Panel',
                'code': 'IRON-PANEL',
                'category': 'hematology',
                'sample_type': 'Serum',
                'description': 'Comprehensive assessment of iron metabolism',
                'turnaround_time': '2 hours',
                'normal_range': {
                    'Serum Iron': {'unit': 'µg/dL', 'min': '60', 'max': '170', 'dataType': 'numeric', 'required': True},
                    'Total Iron Binding Capacity (TIBC)': {'unit': 'µg/dL', 'min': '250', 'max': '400', 'dataType': 'numeric', 'required': True},
                    'Transferrin Saturation': {'unit': '%', 'min': '20', 'max': '50', 'dataType': 'numeric', 'required': True},
                    'Ferritin': {'unit': 'ng/mL', 'min': '15', 'max': '200', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Vitamin B12 Level',
                'code': 'B12',
                'category': 'hematology',
                'sample_type': 'Serum',
                'description': 'Vitamin B12 concentration in serum',
                'turnaround_time': '4 hours',
                'normal_range': {
                    'Vitamin B12': {'unit': 'pg/mL', 'min': '200', 'max': '900', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Folic Acid Level',
                'code': 'FOLATE',
                'category': 'hematology',
                'sample_type': 'Serum',
                'description': 'Folic acid concentration in serum',
                'turnaround_time': '4 hours',
                'normal_range': {
                    'Folic Acid': {'unit': 'ng/mL', 'min': '3.0', 'max': '17.0', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Red Cell Indices',
                'code': 'RCI',
                'category': 'hematology',
                'sample_type': 'EDTA Blood',
                'description': 'Red blood cell indices including MCV, MCH, MCHC, RDW',
                'turnaround_time': '1 hour',
                'normal_range': {
                    'MCV (Mean Corpuscular Volume)': {'unit': 'fL', 'min': '80', 'max': '100', 'dataType': 'numeric', 'required': True},
                    'MCH (Mean Corpuscular Hemoglobin)': {'unit': 'pg', 'min': '27', 'max': '32', 'dataType': 'numeric', 'required': True},
                    'MCHC (Mean Corpuscular Hemoglobin Concentration)': {'unit': 'g/dL', 'min': '32', 'max': '36', 'dataType': 'numeric', 'required': True},
                    'RDW (Red Cell Distribution Width)': {'unit': '%', 'min': '11.5', 'max': '14.5', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Absolute Neutrophil Count',
                'code': 'ANC',
                'category': 'hematology',
                'sample_type': 'EDTA Blood',
                'description': 'Absolute count of neutrophils',
                'turnaround_time': '1 hour',
                'normal_range': {
                    'Absolute Neutrophil Count': {'unit': 'cells/µL', 'min': '1500', 'max': '8000', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Absolute Lymphocyte Count',
                'code': 'ALC',
                'category': 'hematology',
                'sample_type': 'EDTA Blood',
                'description': 'Absolute count of lymphocytes',
                'turnaround_time': '1 hour',
                'normal_range': {
                    'Absolute Lymphocyte Count': {'unit': 'cells/µL', 'min': '1000', 'max': '4800', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Platelet Function Assay (PFA-100)',
                'code': 'PFA100',
                'category': 'hematology',
                'sample_type': 'Whole Blood',
                'description': 'Platelet function screening test',
                'turnaround_time': '30 minutes',
                'normal_range': {
                    'Closure Time (Collagen/Epinephrine)': {'unit': 'seconds', 'min': '85', 'max': '165', 'dataType': 'numeric', 'required': True},
                    'Closure Time (Collagen/ADP)': {'unit': 'seconds', 'min': '68', 'max': '121', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Thrombin Time (TT)',
                'code': 'TT',
                'category': 'hematology',
                'sample_type': 'Citrated Plasma',
                'description': 'Time required for fibrinogen to clot after thrombin addition',
                'turnaround_time': '30 minutes',
                'normal_range': {
                    'Thrombin Time': {'unit': 'seconds', 'min': '14', 'max': '19', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Factor VIII Assay',
                'code': 'F8',
                'category': 'hematology',
                'sample_type': 'Citrated Plasma',
                'description': 'Coagulation factor VIII activity level',
                'turnaround_time': '24 hours',
                'normal_range': {
                    'Factor VIII Activity': {'unit': '%', 'min': '50', 'max': '150', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Factor IX Assay',
                'code': 'F9',
                'category': 'hematology',
                'sample_type': 'Citrated Plasma',
                'description': 'Coagulation factor IX activity level',
                'turnaround_time': '24 hours',
                'normal_range': {
                    'Factor IX Activity': {'unit': '%', 'min': '50', 'max': '150', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'von Willebrand Factor Antigen',
                'code': 'VWF-AG',
                'category': 'hematology',
                'sample_type': 'Citrated Plasma',
                'description': 'von Willebrand factor antigen concentration',
                'turnaround_time': '24 hours',
                'normal_range': {
                    'vWF Antigen': {'unit': '%', 'min': '50', 'max': '150', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'von Willebrand Factor Activity (Ristocetin Cofactor)',
                'code': 'VWF-RCO',
                'category': 'hematology',
                'sample_type': 'Citrated Plasma',
                'description': 'von Willebrand factor activity measurement',
                'turnaround_time': '24 hours',
                'normal_range': {
                    'vWF Activity': {'unit': '%', 'min': '50', 'max': '150', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Lupus Anticoagulant Screen',
                'code': 'LA-SCREEN',
                'category': 'hematology',
                'sample_type': 'Citrated Plasma',
                'description': 'Screening for lupus anticoagulant',
                'turnaround_time': '48 hours',
                'normal_range': {
                    'LA Screen': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                    'DRVVT Screen': {'unit': 'seconds', 'min': '30', 'max': '40', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Anticardiolipin Antibodies (IgG)',
                'code': 'ACA-IGG',
                'category': 'hematology',
                'sample_type': 'Serum',
                'description': 'Anticardiolipin antibody IgG isotype',
                'turnaround_time': '48 hours',
                'normal_range': {
                    'Anticardiolipin IgG': {'unit': 'GPL-U/mL', 'min': '0', 'max': '15', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Anticardiolipin Antibodies (IgM)',
                'code': 'ACA-IGM',
                'category': 'hematology',
                'sample_type': 'Serum',
                'description': 'Anticardiolipin antibody IgM isotype',
                'turnaround_time': '48 hours',
                'normal_range': {
                    'Anticardiolipin IgM': {'unit': 'MPL-U/mL', 'min': '0', 'max': '15', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Anti-Beta-2 Glycoprotein I Antibodies (IgG)',
                'code': 'B2GPI-IGG',
                'category': 'hematology',
                'sample_type': 'Serum',
                'description': 'Anti-beta-2 glycoprotein I antibody IgG isotype',
                'turnaround_time': '48 hours',
                'normal_range': {
                    'Anti-β2GPI IgG': {'unit': 'SGU', 'min': '0', 'max': '20', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Platelet Count',
                'code': 'PLT',
                'category': 'hematology',
                'sample_type': 'EDTA Blood',
                'description': 'Platelet count determination',
                'turnaround_time': '30 minutes',
                'normal_range': {
                    'Platelet Count': {'unit': 'x10³/µL', 'min': '150', 'max': '450', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Mean Platelet Volume (MPV)',
                'code': 'MPV',
                'category': 'hematology',
                'sample_type': 'EDTA Blood',
                'description': 'Average size of platelets',
                'turnaround_time': '30 minutes',
                'normal_range': {
                    'MPV': {'unit': 'fL', 'min': '7.5', 'max': '11.5', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Platelet Distribution Width (PDW)',
                'code': 'PDW',
                'category': 'hematology',
                'sample_type': 'EDTA Blood',
                'description': 'Variation in platelet size',
                'turnaround_time': '30 minutes',
                'normal_range': {
                    'PDW': {'unit': '%', 'min': '10', 'max': '18', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Blood Group & Rh Type',
                'code': 'ABO-RH',
                'category': 'hematology',
                'sample_type': 'EDTA Blood',
                'description': 'Determination of ABO blood group and Rh factor',
                'turnaround_time': '30 minutes',
                'normal_range': {
                    'Blood Group': {'unit': '', 'range': 'A/B/AB/O', 'dataType': 'text', 'required': True},
                    'Rh Type': {'unit': '', 'range': 'Positive/Negative', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Direct Coombs Test',
                'code': 'DCT',
                'category': 'hematology',
                'sample_type': 'EDTA Blood',
                'description': 'Detection of antibodies bound to red blood cells',
                'turnaround_time': '1 hour',
                'normal_range': {
                    'Direct Coombs Test': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Indirect Coombs Test',
                'code': 'ICT',
                'category': 'hematology',
                'sample_type': 'Serum',
                'description': 'Detection of antibodies in serum that can bind to red blood cells',
                'turnaround_time': '1 hour',
                'normal_range': {
                    'Indirect Coombs Test': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Cold Agglutinins',
                'code': 'COLD-AGG',
                'category': 'hematology',
                'sample_type': 'Serum',
                'description': 'Detection of cold-reacting antibodies',
                'turnaround_time': '24 hours',
                'normal_range': {
                    'Cold Agglutinins': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                    'Titer': {'unit': '', 'range': '<1:32', 'dataType': 'text', 'required': False},
                }
            },
            {
                'name': 'Haptoglobin',
                'code': 'HPT',
                'category': 'hematology',
                'sample_type': 'Serum',
                'description': 'Haptoglobin concentration (hemolysis marker)',
                'turnaround_time': '4 hours',
                'normal_range': {
                    'Haptoglobin': {'unit': 'mg/dL', 'min': '30', 'max': '200', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Lactate Dehydrogenase (LDH)',
                'code': 'LDH',
                'category': 'hematology',
                'sample_type': 'Serum',
                'description': 'Lactate dehydrogenase enzyme activity',
                'turnaround_time': '2 hours',
                'normal_range': {
                    'LDH': {'unit': 'U/L', 'min': '140', 'max': '280', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Total Bilirubin',
                'code': 'TBIL',
                'category': 'hematology',
                'sample_type': 'Serum',
                'description': 'Total bilirubin concentration (hemolysis marker)',
                'turnaround_time': '2 hours',
                'normal_range': {
                    'Total Bilirubin': {'unit': 'mg/dL', 'min': '0.3', 'max': '1.2', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Unconjugated Bilirubin',
                'code': 'UBIL',
                'category': 'hematology',
                'sample_type': 'Serum',
                'description': 'Unconjugated bilirubin concentration',
                'turnaround_time': '2 hours',
                'normal_range': {
                    'Unconjugated Bilirubin': {'unit': 'mg/dL', 'min': '0.2', 'max': '0.8', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Conjugated Bilirubin',
                'code': 'CBIL',
                'category': 'hematology',
                'sample_type': 'Serum',
                'description': 'Conjugated bilirubin concentration',
                'turnaround_time': '2 hours',
                'normal_range': {
                    'Conjugated Bilirubin': {'unit': 'mg/dL', 'min': '0.0', 'max': '0.3', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Sickle Cell Screen',
                'code': 'SICKLE-SCREEN',
                'category': 'hematology',
                'sample_type': 'EDTA Blood',
                'description': 'Screening for sickle cell disease',
                'turnaround_time': '24 hours',
                'normal_range': {
                    'Sickle Cell Screen': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'G6PD Screen',
                'code': 'G6PD-SCREEN',
                'category': 'hematology',
                'sample_type': 'EDTA Blood',
                'description': 'Screening for glucose-6-phosphate dehydrogenase deficiency',
                'turnaround_time': '4 hours',
                'normal_range': {
                    'G6PD Activity': {'unit': 'U/g Hb', 'min': '4.6', 'max': '13.5', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Osmotic Fragility Test',
                'code': 'OFT',
                'category': 'hematology',
                'sample_type': 'EDTA Blood',
                'description': 'Assessment of red blood cell membrane stability',
                'turnaround_time': '24 hours',
                'normal_range': {
                    'Osmotic Fragility': {'unit': '', 'range': 'Normal', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Eosinophil Count',
                'code': 'EOS',
                'category': 'hematology',
                'sample_type': 'EDTA Blood',
                'description': 'Absolute eosinophil count',
                'turnaround_time': '1 hour',
                'normal_range': {
                    'Eosinophil Count': {'unit': 'cells/µL', 'min': '50', 'max': '500', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Basophil Count',
                'code': 'BASO',
                'category': 'hematology',
                'sample_type': 'EDTA Blood',
                'description': 'Absolute basophil count',
                'turnaround_time': '1 hour',
                'normal_range': {
                    'Basophil Count': {'unit': 'cells/µL', 'min': '0', 'max': '100', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Monocyte Count',
                'code': 'MONO',
                'category': 'hematology',
                'sample_type': 'EDTA Blood',
                'description': 'Absolute monocyte count',
                'turnaround_time': '1 hour',
                'normal_range': {
                    'Monocyte Count': {'unit': 'cells/µL', 'min': '200', 'max': '1000', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Nucleated Red Blood Cells (NRBC)',
                'code': 'NRBC',
                'category': 'hematology',
                'sample_type': 'EDTA Blood',
                'description': 'Count of nucleated red blood cells per 100 WBC',
                'turnaround_time': '1 hour',
                'normal_range': {
                    'NRBC': {'unit': '/100 WBC', 'min': '0', 'max': '0', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'RBC Morphology',
                'code': 'RBC-MORPH',
                'category': 'hematology',
                'sample_type': 'EDTA Blood',
                'description': 'Detailed assessment of red blood cell morphology',
                'turnaround_time': '2 hours',
                'normal_range': {
                    'Anisocytosis': {'unit': '', 'range': 'None/Mild/Moderate/Severe', 'dataType': 'text', 'required': True},
                    'Poikilocytosis': {'unit': '', 'range': 'None/Mild/Moderate/Severe', 'dataType': 'text', 'required': True},
                    'Polychromasia': {'unit': '', 'range': 'None/Mild/Moderate/Severe', 'dataType': 'text', 'required': True},
                    'Hypochromia': {'unit': '', 'range': 'None/Mild/Moderate/Severe', 'dataType': 'text', 'required': True},
                    'Microcytosis': {'unit': '', 'range': 'None/Mild/Moderate/Severe', 'dataType': 'text', 'required': True},
                    'Macrocytosis': {'unit': '', 'range': 'None/Mild/Moderate/Severe', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'WBC Morphology',
                'code': 'WBC-MORPH',
                'category': 'hematology',
                'sample_type': 'EDTA Blood',
                'description': 'Detailed assessment of white blood cell morphology',
                'turnaround_time': '2 hours',
                'normal_range': {
                    'Neutrophil Morphology': {'unit': '', 'range': 'Normal', 'dataType': 'text', 'required': True},
                    'Lymphocyte Morphology': {'unit': '', 'range': 'Normal', 'dataType': 'text', 'required': True},
                    'Monocyte Morphology': {'unit': '', 'range': 'Normal', 'dataType': 'text', 'required': True},
                    'Eosinophil Morphology': {'unit': '', 'range': 'Normal', 'dataType': 'text', 'required': True},
                    'Basophil Morphology': {'unit': '', 'range': 'Normal', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Platelet Morphology',
                'code': 'PLT-MORPH',
                'category': 'hematology',
                'sample_type': 'EDTA Blood',
                'description': 'Assessment of platelet morphology and clumping',
                'turnaround_time': '2 hours',
                'normal_range': {
                    'Platelet Size': {'unit': '', 'range': 'Normal', 'dataType': 'text', 'required': True},
                    'Platelet Granularity': {'unit': '', 'range': 'Normal', 'dataType': 'text', 'required': True},
                    'Platelet Clumping': {'unit': '', 'range': 'None/Present', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Malaria Parasite Detection',
                'code': 'MALARIA',
                'category': 'hematology',
                'sample_type': 'EDTA Blood',
                'description': 'Detection and identification of malaria parasites',
                'turnaround_time': '2 hours',
                'normal_range': {
                    'Malaria Parasites': {'unit': '', 'range': 'Not detected', 'dataType': 'text', 'required': True},
                    'Species': {'unit': '', 'range': 'N/A', 'dataType': 'text', 'required': False},
                    'Parasitemia': {'unit': '%', 'min': '0', 'max': '0', 'dataType': 'numeric', 'required': False},
                }
            },
            {
                'name': 'CD4 Count',
                'code': 'CD4',
                'category': 'hematology',
                'sample_type': 'EDTA Blood',
                'description': 'CD4+ T lymphocyte count',
                'turnaround_time': '24 hours',
                'normal_range': {
                    'CD4 Count': {'unit': 'cells/µL', 'min': '500', 'max': '1600', 'dataType': 'numeric', 'required': True},
                    'CD4 Percentage': {'unit': '%', 'min': '30', 'max': '60', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'CD4/CD8 Ratio',
                'code': 'CD4-CD8',
                'category': 'hematology',
                'sample_type': 'EDTA Blood',
                'description': 'Ratio of CD4+ to CD8+ T lymphocytes',
                'turnaround_time': '24 hours',
                'normal_range': {
                    'CD4/CD8 Ratio': {'unit': '', 'min': '1.0', 'max': '4.0', 'dataType': 'numeric', 'required': True},
                    'CD8 Count': {'unit': 'cells/µL', 'min': '200', 'max': '800', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Differential White Blood Cell Count',
                'code': 'DIFF',
                'sample_type': 'EDTA Blood',
                'description': 'Percentage and absolute count of different types of white blood cells',
                'normal_range': {
                    'Neutrophils': {'unit': '%', 'min': '40', 'max': '70', 'dataType': 'numeric', 'required': True},
                    'Lymphocytes': {'unit': '%', 'min': '20', 'max': '45', 'dataType': 'numeric', 'required': True},
                    'Monocytes': {'unit': '%', 'min': '2', 'max': '10', 'dataType': 'numeric', 'required': True},
                    'Eosinophils': {'unit': '%', 'min': '0', 'max': '6', 'dataType': 'numeric', 'required': True},
                    'Basophils': {'unit': '%', 'min': '0', 'max': '2', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Erythrocyte Sedimentation Rate (ESR)',
                'code': 'ESR',
                'sample_type': 'EDTA Blood',
                'description': 'Rate at which red blood cells settle in a tube',
                'normal_range': {
                    'ESR': {'unit': 'mm/hr', 'min': '0', 'max': '20', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Peripheral Blood Smear',
                'code': 'PBS',
                'sample_type': 'EDTA Blood',
                'description': 'Microscopic examination of blood cells',
                'normal_range': {
                    'Red Cell Morphology': {'unit': '', 'range': 'Normal', 'dataType': 'text', 'required': True},
                    'White Cell Morphology': {'unit': '', 'range': 'Normal', 'dataType': 'text', 'required': True},
                    'Platelet Morphology': {'unit': '', 'range': 'Normal', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Reticulocyte Count',
                'code': 'RETIC',
                'sample_type': 'EDTA Blood',
                'description': 'Percentage of reticulocytes (immature red blood cells)',
                'normal_range': {
                    'Reticulocyte Count': {'unit': '%', 'min': '0.5', 'max': '2.5', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Hemoglobin Electrophoresis',
                'code': 'HB-ELEC',
                'sample_type': 'EDTA Blood',
                'description': 'Analysis of hemoglobin types',
                'normal_range': {
                    'HbA': {'unit': '%', 'min': '95', 'max': '98', 'dataType': 'numeric', 'required': True},
                    'HbA2': {'unit': '%', 'min': '1.5', 'max': '3.5', 'dataType': 'numeric', 'required': True},
                    'HbF': {'unit': '%', 'min': '0', 'max': '1', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Bleeding Time',
                'code': 'BT',
                'sample_type': 'Whole Blood',
                'description': 'Time taken for bleeding to stop',
                'normal_range': {
                    'Bleeding Time': {'unit': 'minutes', 'min': '2', 'max': '8', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Clotting Time',
                'code': 'CT',
                'sample_type': 'Whole Blood',
                'description': 'Time taken for blood to clot',
                'normal_range': {
                    'Clotting Time': {'unit': 'minutes', 'min': '5', 'max': '15', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Prothrombin Time (PT)',
                'code': 'PT',
                'sample_type': 'Citrated Plasma',
                'description': 'Time taken for blood plasma to clot',
                'normal_range': {
                    'PT': {'unit': 'seconds', 'min': '11', 'max': '15', 'dataType': 'numeric', 'required': True},
                    'INR': {'unit': '', 'min': '0.9', 'max': '1.2', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Activated Partial Thromboplastin Time (APTT)',
                'code': 'APTT',
                'sample_type': 'Citrated Plasma',
                'description': 'Screening test for coagulation disorders',
                'normal_range': {
                    'APTT': {'unit': 'seconds', 'min': '25', 'max': '35', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Fibrinogen',
                'code': 'FIB',
                'sample_type': 'Citrated Plasma',
                'description': 'Blood clotting protein level',
                'normal_range': {
                    'Fibrinogen': {'unit': 'mg/dL', 'min': '200', 'max': '400', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'D-Dimer',
                'code': 'D-DIMER',
                'sample_type': 'Citrated Plasma',
                'description': 'Marker for blood clot formation',
                'normal_range': {
                    'D-Dimer': {'unit': 'µg/mL', 'min': '0', 'max': '0.5', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Iron Studies',
                'code': 'IRON-STUDY',
                'sample_type': 'Serum',
                'description': 'Iron, TIBC, and ferritin levels',
                'normal_range': {
                    'Serum Iron': {'unit': 'µg/dL', 'min': '60', 'max': '170', 'dataType': 'numeric', 'required': True},
                    'TIBC': {'unit': 'µg/dL', 'min': '250', 'max': '400', 'dataType': 'numeric', 'required': True},
                    'Transferrin Saturation': {'unit': '%', 'min': '20', 'max': '50', 'dataType': 'numeric', 'required': True},
                    'Ferritin': {'unit': 'ng/mL', 'min': '15', 'max': '200', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Vitamin B12',
                'code': 'B12',
                'sample_type': 'Serum',
                'description': 'Vitamin B12 level',
                'normal_range': {
                    'Vitamin B12': {'unit': 'pg/mL', 'min': '200', 'max': '900', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Folic Acid',
                'code': 'FOLATE',
                'sample_type': 'Serum',
                'description': 'Folic acid level',
                'normal_range': {
                    'Folic Acid': {'unit': 'ng/mL', 'min': '3.0', 'max': '17.0', 'dataType': 'numeric', 'required': True},
                }
            },

            # Chemistry Tests
            {
                'name': 'Basic Metabolic Panel (BMP)',
                'code': 'BMP',
                'sample_type': 'Serum',
                'description': 'Basic metabolic panel including glucose, electrolytes, and kidney function',
                'normal_range': {
                    'Glucose': {'unit': 'mg/dL', 'min': '70', 'max': '100', 'dataType': 'numeric', 'required': True},
                    'Sodium': {'unit': 'mEq/L', 'min': '136', 'max': '145', 'dataType': 'numeric', 'required': True},
                    'Potassium': {'unit': 'mEq/L', 'min': '3.5', 'max': '5.0', 'dataType': 'numeric', 'required': True},
                    'Chloride': {'unit': 'mEq/L', 'min': '98', 'max': '107', 'dataType': 'numeric', 'required': True},
                    'Bicarbonate': {'unit': 'mEq/L', 'min': '22', 'max': '28', 'dataType': 'numeric', 'required': True},
                    'BUN': {'unit': 'mg/dL', 'min': '7', 'max': '20', 'dataType': 'numeric', 'required': True},
                    'Creatinine': {'unit': 'mg/dL', 'min': '0.6', 'max': '1.2', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Comprehensive Metabolic Panel (CMP)',
                'code': 'CMP',
                'sample_type': 'Serum',
                'description': 'Extended metabolic panel including liver function tests',
                'normal_range': {
                    'Glucose': {'unit': 'mg/dL', 'min': '70', 'max': '100', 'dataType': 'numeric', 'required': True},
                    'Sodium': {'unit': 'mEq/L', 'min': '136', 'max': '145', 'dataType': 'numeric', 'required': True},
                    'Potassium': {'unit': 'mEq/L', 'min': '3.5', 'max': '5.0', 'dataType': 'numeric', 'required': True},
                    'Chloride': {'unit': 'mEq/L', 'min': '98', 'max': '107', 'dataType': 'numeric', 'required': True},
                    'Bicarbonate': {'unit': 'mEq/L', 'min': '22', 'max': '28', 'dataType': 'numeric', 'required': True},
                    'BUN': {'unit': 'mg/dL', 'min': '7', 'max': '20', 'dataType': 'numeric', 'required': True},
                    'Creatinine': {'unit': 'mg/dL', 'min': '0.6', 'max': '1.2', 'dataType': 'numeric', 'required': True},
                    'Total Protein': {'unit': 'g/dL', 'min': '6.0', 'max': '8.3', 'dataType': 'numeric', 'required': True},
                    'Albumin': {'unit': 'g/dL', 'min': '3.5', 'max': '5.0', 'dataType': 'numeric', 'required': True},
                    'Total Bilirubin': {'unit': 'mg/dL', 'min': '0.2', 'max': '1.2', 'dataType': 'numeric', 'required': True},
                    'ALT': {'unit': 'U/L', 'min': '7', 'max': '56', 'dataType': 'numeric', 'required': True},
                    'AST': {'unit': 'U/L', 'min': '10', 'max': '40', 'dataType': 'numeric', 'required': True},
                    'ALP': {'unit': 'U/L', 'min': '44', 'max': '147', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Fasting Blood Sugar (FBS)',
                'code': 'FBS',
                'sample_type': 'Serum',
                'description': 'Blood glucose level after fasting',
                'normal_range': {
                    'Glucose': {'unit': 'mg/dL', 'min': '70', 'max': '100', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Random Blood Sugar (RBS)',
                'code': 'RBS',
                'sample_type': 'Serum',
                'description': 'Blood glucose level at random time',
                'normal_range': {
                    'Glucose': {'unit': 'mg/dL', 'min': '70', 'max': '140', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Oral Glucose Tolerance Test (OGTT)',
                'code': 'OGTT',
                'sample_type': 'Serum',
                'description': 'Glucose levels before and after glucose load',
                'normal_range': {
                    'Fasting': {'unit': 'mg/dL', 'min': '70', 'max': '100', 'dataType': 'numeric', 'required': True},
                    '2-hour Postprandial': {'unit': 'mg/dL', 'min': '70', 'max': '140', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'HbA1c (Glycated Hemoglobin)',
                'code': 'HBA1C',
                'sample_type': 'EDTA Blood',
                'description': 'Average blood sugar over 2-3 months',
                'normal_range': {
                    'HbA1c': {'unit': '%', 'min': '4.0', 'max': '5.6', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Liver Function Test (LFT)',
                'code': 'LFT',
                'sample_type': 'Serum',
                'description': 'Comprehensive liver function panel',
                'normal_range': {
                    'Total Bilirubin': {'unit': 'mg/dL', 'min': '0.2', 'max': '1.2', 'dataType': 'numeric', 'required': True},
                    'Direct Bilirubin': {'unit': 'mg/dL', 'min': '0', 'max': '0.3', 'dataType': 'numeric', 'required': True},
                    'Indirect Bilirubin': {'unit': 'mg/dL', 'min': '0.2', 'max': '0.9', 'dataType': 'numeric', 'required': True},
                    'ALT': {'unit': 'U/L', 'min': '7', 'max': '56', 'dataType': 'numeric', 'required': True},
                    'AST': {'unit': 'U/L', 'min': '10', 'max': '40', 'dataType': 'numeric', 'required': True},
                    'ALP': {'unit': 'U/L', 'min': '44', 'max': '147', 'dataType': 'numeric', 'required': True},
                    'GGT': {'unit': 'U/L', 'min': '9', 'max': '48', 'dataType': 'numeric', 'required': False},
                    'Total Protein': {'unit': 'g/dL', 'min': '6.0', 'max': '8.3', 'dataType': 'numeric', 'required': True},
                    'Albumin': {'unit': 'g/dL', 'min': '3.5', 'max': '5.0', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Renal Function Test (RFT)',
                'code': 'RFT',
                'sample_type': 'Serum',
                'description': 'Kidney function assessment',
                'normal_range': {
                    'BUN': {'unit': 'mg/dL', 'min': '7', 'max': '20', 'dataType': 'numeric', 'required': True},
                    'Creatinine': {'unit': 'mg/dL', 'min': '0.6', 'max': '1.2', 'dataType': 'numeric', 'required': True},
                    'Uric Acid': {'unit': 'mg/dL', 'min': '3.5', 'max': '7.2', 'dataType': 'numeric', 'required': True},
                    'Sodium': {'unit': 'mEq/L', 'min': '136', 'max': '145', 'dataType': 'numeric', 'required': True},
                    'Potassium': {'unit': 'mEq/L', 'min': '3.5', 'max': '5.0', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Lipid Profile',
                'code': 'LIPID',
                'sample_type': 'Serum',
                'description': 'Cholesterol and triglyceride levels',
                'turnaround_time': '1 hour',
                'normal_range': {
                    'Total Cholesterol': {'unit': 'mg/dL', 'min': '0', 'max': '200', 'dataType': 'numeric', 'required': True},
                    'LDL Cholesterol': {'unit': 'mg/dL', 'min': '0', 'max': '100', 'dataType': 'numeric', 'required': True},
                    'HDL Cholesterol': {'unit': 'mg/dL', 'min': '40', 'max': '100', 'dataType': 'numeric', 'required': True},
                    'Triglycerides': {'unit': 'mg/dL', 'min': '0', 'max': '150', 'dataType': 'numeric', 'required': True},
                    'Total/HDL Ratio': {'unit': '', 'min': '0', 'max': '5', 'dataType': 'numeric', 'required': False},
                }
            },
            {
                'name': 'Thyroid Function Test (TFT)',
                'code': 'TFT',
                'sample_type': 'Serum',
                'description': 'Thyroid hormone levels',
                'normal_range': {
                    'TSH': {'unit': 'mIU/L', 'min': '0.4', 'max': '4.0', 'dataType': 'numeric', 'required': True},
                    'Free T3': {'unit': 'pg/mL', 'min': '2.3', 'max': '4.2', 'dataType': 'numeric', 'required': True},
                    'Free T4': {'unit': 'ng/dL', 'min': '0.8', 'max': '1.8', 'dataType': 'numeric', 'required': True},
                    'Total T3': {'unit': 'ng/dL', 'min': '70', 'max': '200', 'dataType': 'numeric', 'required': False},
                    'Total T4': {'unit': 'µg/dL', 'min': '4.5', 'max': '12', 'dataType': 'numeric', 'required': False},
                }
            },
            {
                'name': 'Cardiac Enzymes',
                'code': 'CARDIAC-ENZ',
                'sample_type': 'Serum',
                'description': 'Cardiac marker enzymes',
                'normal_range': {
                    'CK-MB': {'unit': 'ng/mL', 'min': '0', 'max': '5', 'dataType': 'numeric', 'required': True},
                    'Troponin I': {'unit': 'ng/mL', 'min': '0', 'max': '0.04', 'dataType': 'numeric', 'required': True},
                    'Troponin T': {'unit': 'ng/mL', 'min': '0', 'max': '0.01', 'dataType': 'numeric', 'required': True},
                    'LDH': {'unit': 'U/L', 'min': '140', 'max': '280', 'dataType': 'numeric', 'required': False},
                }
            },
            {
                'name': 'Electrolyte Panel',
                'code': 'ELECTROLYTE',
                'sample_type': 'Serum',
                'description': 'Sodium, potassium, chloride, and bicarbonate levels',
                'turnaround_time': '1 hour',
                'normal_range': {
                    'Sodium': {'unit': 'mEq/L', 'min': '136', 'max': '145', 'dataType': 'numeric', 'required': True},
                    'Potassium': {'unit': 'mEq/L', 'min': '3.5', 'max': '5.0', 'dataType': 'numeric', 'required': True},
                    'Chloride': {'unit': 'mEq/L', 'min': '98', 'max': '107', 'dataType': 'numeric', 'required': True},
                    'Bicarbonate': {'unit': 'mEq/L', 'min': '22', 'max': '28', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Calcium',
                'code': 'CALCIUM',
                'sample_type': 'Serum',
                'description': 'Total calcium level',
                'normal_range': {
                    'Total Calcium': {'unit': 'mg/dL', 'min': '8.5', 'max': '10.5', 'dataType': 'numeric', 'required': True},
                    'Ionized Calcium': {'unit': 'mg/dL', 'min': '4.5', 'max': '5.3', 'dataType': 'numeric', 'required': False},
                }
            },
            {
                'name': 'Phosphorus',
                'code': 'PHOS',
                'sample_type': 'Serum',
                'description': 'Phosphorus level',
                'normal_range': {
                    'Phosphorus': {'unit': 'mg/dL', 'min': '2.5', 'max': '4.5', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Magnesium',
                'code': 'MAG',
                'sample_type': 'Serum',
                'description': 'Magnesium level',
                'normal_range': {
                    'Magnesium': {'unit': 'mg/dL', 'min': '1.7', 'max': '2.2', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Uric Acid',
                'code': 'UA',
                'sample_type': 'Serum',
                'description': 'Uric acid level',
                'normal_range': {
                    'Uric Acid': {'unit': 'mg/dL', 'min': '3.5', 'max': '7.2', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Total Protein',
                'code': 'TP',
                'sample_type': 'Serum',
                'description': 'Total protein level',
                'normal_range': {
                    'Total Protein': {'unit': 'g/dL', 'min': '6.0', 'max': '8.3', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Albumin',
                'code': 'ALB',
                'sample_type': 'Serum',
                'description': 'Albumin level',
                'normal_range': {
                    'Albumin': {'unit': 'g/dL', 'min': '3.5', 'max': '5.0', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Total Bilirubin',
                'code': 'TBIL',
                'sample_type': 'Serum',
                'description': 'Total bilirubin level',
                'normal_range': {
                    'Total Bilirubin': {'unit': 'mg/dL', 'min': '0.2', 'max': '1.2', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Direct Bilirubin',
                'code': 'DBIL',
                'sample_type': 'Serum',
                'description': 'Direct (conjugated) bilirubin',
                'normal_range': {
                    'Direct Bilirubin': {'unit': 'mg/dL', 'min': '0', 'max': '0.3', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'ALT (Alanine Transaminase)',
                'code': 'ALT',
                'sample_type': 'Serum',
                'description': 'Liver enzyme',
                'normal_range': {
                    'ALT': {'unit': 'U/L', 'min': '7', 'max': '56', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'AST (Aspartate Transaminase)',
                'code': 'AST',
                'sample_type': 'Serum',
                'description': 'Liver enzyme',
                'normal_range': {
                    'AST': {'unit': 'U/L', 'min': '10', 'max': '40', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'ALP (Alkaline Phosphatase)',
                'code': 'ALP',
                'sample_type': 'Serum',
                'description': 'Liver and bone enzyme',
                'normal_range': {
                    'ALP': {'unit': 'U/L', 'min': '44', 'max': '147', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'GGT (Gamma-Glutamyl Transferase)',
                'code': 'GGT',
                'sample_type': 'Serum',
                'description': 'Liver enzyme',
                'normal_range': {
                    'GGT': {'unit': 'U/L', 'min': '9', 'max': '48', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Creatinine',
                'code': 'CREAT',
                'sample_type': 'Serum',
                'description': 'Kidney function marker',
                'normal_range': {
                    'Creatinine': {'unit': 'mg/dL', 'min': '0.6', 'max': '1.2', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'BUN (Blood Urea Nitrogen)',
                'code': 'BUN',
                'sample_type': 'Serum',
                'description': 'Kidney function marker',
                'normal_range': {
                    'BUN': {'unit': 'mg/dL', 'min': '7', 'max': '20', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Creatinine Clearance',
                'code': 'CREAT-CL',
                'sample_type': 'Urine + Serum',
                'description': 'Kidney function assessment',
                'normal_range': {
                    'Creatinine Clearance': {'unit': 'mL/min', 'min': '90', 'max': '120', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'C-Reactive Protein (CRP)',
                'code': 'CRP',
                'sample_type': 'Serum',
                'description': 'Inflammation marker',
                'normal_range': {
                    'CRP': {'unit': 'mg/L', 'min': '0', 'max': '3', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'High Sensitivity CRP (hs-CRP)',
                'code': 'HS-CRP',
                'sample_type': 'Serum',
                'description': 'Cardiovascular risk marker',
                'normal_range': {
                    'hs-CRP': {'unit': 'mg/L', 'min': '0', 'max': '1', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Erythrocyte Sedimentation Rate (ESR)',
                'code': 'ESR',
                'sample_type': 'EDTA Blood',
                'description': 'Inflammation marker',
                'normal_range': {
                    'ESR': {'unit': 'mm/hr', 'min': '0', 'max': '20', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Rheumatoid Factor (RF)',
                'code': 'RF',
                'sample_type': 'Serum',
                'description': 'Rheumatoid arthritis marker',
                'normal_range': {
                    'RF': {'unit': 'IU/mL', 'min': '0', 'max': '15', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Anti-CCP Antibody',
                'code': 'ANTI-CCP',
                'sample_type': 'Serum',
                'description': 'Rheumatoid arthritis marker',
                'normal_range': {
                    'Anti-CCP': {'unit': 'U/mL', 'min': '0', 'max': '20', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'ANA (Antinuclear Antibody)',
                'code': 'ANA',
                'sample_type': 'Serum',
                'description': 'Autoimmune disease marker',
                'normal_range': {
                    'ANA': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Vitamin D (25-OH)',
                'code': 'VIT-D',
                'sample_type': 'Serum',
                'description': 'Vitamin D level',
                'normal_range': {
                    'Vitamin D': {'unit': 'ng/mL', 'min': '30', 'max': '100', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Parathyroid Hormone (PTH)',
                'code': 'PTH',
                'sample_type': 'Serum',
                'description': 'Parathyroid hormone level',
                'normal_range': {
                    'PTH': {'unit': 'pg/mL', 'min': '10', 'max': '65', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Cortisol',
                'code': 'CORTISOL',
                'sample_type': 'Serum',
                'description': 'Stress hormone level',
                'normal_range': {
                    'Morning Cortisol': {'unit': 'µg/dL', 'min': '5', 'max': '25', 'dataType': 'numeric', 'required': True},
                    'Evening Cortisol': {'unit': 'µg/dL', 'min': '0', 'max': '10', 'dataType': 'numeric', 'required': False},
                }
            },
            {
                'name': 'Prolactin',
                'code': 'PROLACTIN',
                'sample_type': 'Serum',
                'description': 'Prolactin hormone level',
                'normal_range': {
                    'Prolactin': {'unit': 'ng/mL', 'min': '2', 'max': '18', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'FSH (Follicle Stimulating Hormone)',
                'code': 'FSH',
                'sample_type': 'Serum',
                'description': 'Reproductive hormone',
                'normal_range': {
                    'FSH': {'unit': 'mIU/mL', 'min': '1.5', 'max': '12.4', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'LH (Luteinizing Hormone)',
                'code': 'LH',
                'sample_type': 'Serum',
                'description': 'Reproductive hormone',
                'normal_range': {
                    'LH': {'unit': 'mIU/mL', 'min': '1.7', 'max': '8.6', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Testosterone',
                'code': 'TESTO',
                'sample_type': 'Serum',
                'description': 'Male sex hormone',
                'normal_range': {
                    'Total Testosterone': {'unit': 'ng/dL', 'min': '270', 'max': '1070', 'dataType': 'numeric', 'required': True},
                    'Free Testosterone': {'unit': 'pg/mL', 'min': '9.3', 'max': '26.5', 'dataType': 'numeric', 'required': False},
                }
            },
            {
                'name': 'Estradiol',
                'code': 'ESTRADIOL',
                'sample_type': 'Serum',
                'description': 'Female sex hormone',
                'normal_range': {
                    'Estradiol': {'unit': 'pg/mL', 'min': '15', 'max': '350', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Progesterone',
                'code': 'PROG',
                'sample_type': 'Serum',
                'description': 'Female reproductive hormone',
                'normal_range': {
                    'Progesterone': {'unit': 'ng/mL', 'min': '0.1', 'max': '25', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'PSA (Prostate Specific Antigen)',
                'code': 'PSA',
                'sample_type': 'Serum',
                'description': 'Prostate cancer marker',
                'normal_range': {
                    'Total PSA': {'unit': 'ng/mL', 'min': '0', 'max': '4', 'dataType': 'numeric', 'required': True},
                    'Free PSA': {'unit': 'ng/mL', 'min': '0', 'max': '0.93', 'dataType': 'numeric', 'required': False},
                }
            },
            {
                'name': 'CEA (Carcinoembryonic Antigen)',
                'code': 'CEA',
                'sample_type': 'Serum',
                'description': 'Tumor marker',
                'normal_range': {
                    'CEA': {'unit': 'ng/mL', 'min': '0', 'max': '3', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'CA 19-9',
                'code': 'CA19-9',
                'sample_type': 'Serum',
                'description': 'Pancreatic cancer marker',
                'normal_range': {
                    'CA 19-9': {'unit': 'U/mL', 'min': '0', 'max': '37', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'CA 125',
                'code': 'CA125',
                'sample_type': 'Serum',
                'description': 'Ovarian cancer marker',
                'normal_range': {
                    'CA 125': {'unit': 'U/mL', 'min': '0', 'max': '35', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'AFP (Alpha-Fetoprotein)',
                'code': 'AFP',
                'sample_type': 'Serum',
                'description': 'Liver cancer marker',
                'normal_range': {
                    'AFP': {'unit': 'ng/mL', 'min': '0', 'max': '10', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Beta HCG (Pregnancy Test)',
                'code': 'BHCG',
                'sample_type': 'Serum',
                'description': 'Pregnancy hormone',
                'normal_range': {
                    'Beta HCG': {'unit': 'mIU/mL', 'range': 'Negative: <5, Positive: >5', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Amylase',
                'code': 'AMYLASE',
                'sample_type': 'Serum',
                'description': 'Pancreatic enzyme',
                'normal_range': {
                    'Amylase': {'unit': 'U/L', 'min': '25', 'max': '125', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Lipase',
                'code': 'LIPASE',
                'sample_type': 'Serum',
                'description': 'Pancreatic enzyme',
                'normal_range': {
                    'Lipase': {'unit': 'U/L', 'min': '10', 'max': '140', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'LDH (Lactate Dehydrogenase)',
                'code': 'LDH',
                'sample_type': 'Serum',
                'description': 'Tissue damage marker',
                'normal_range': {
                    'LDH': {'unit': 'U/L', 'min': '140', 'max': '280', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'CK (Creatine Kinase)',
                'code': 'CK',
                'sample_type': 'Serum',
                'description': 'Muscle damage marker',
                'normal_range': {
                    'Total CK': {'unit': 'U/L', 'min': '20', 'max': '200', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'CK-MB',
                'code': 'CK-MB',
                'sample_type': 'Serum',
                'description': 'Cardiac muscle marker',
                'normal_range': {
                    'CK-MB': {'unit': 'ng/mL', 'min': '0', 'max': '5', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Troponin I',
                'code': 'TROP-I',
                'sample_type': 'Serum',
                'description': 'Cardiac muscle marker',
                'normal_range': {
                    'Troponin I': {'unit': 'ng/mL', 'min': '0', 'max': '0.04', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Troponin T',
                'code': 'TROP-T',
                'sample_type': 'Serum',
                'description': 'Cardiac muscle marker',
                'normal_range': {
                    'Troponin T': {'unit': 'ng/mL', 'min': '0', 'max': '0.01', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'BNP (Brain Natriuretic Peptide)',
                'code': 'BNP',
                'sample_type': 'Serum',
                'description': 'Heart failure marker',
                'normal_range': {
                    'BNP': {'unit': 'pg/mL', 'min': '0', 'max': '100', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'NT-proBNP',
                'code': 'NT-PROBNP',
                'sample_type': 'Serum',
                'description': 'Heart failure marker',
                'normal_range': {
                    'NT-proBNP': {'unit': 'pg/mL', 'min': '0', 'max': '125', 'dataType': 'numeric', 'required': True},
                }
            },

            # Urine Tests
            {
                'name': 'Urinalysis (Complete)',
                'code': 'UA',
                'sample_type': 'Midstream Urine',
                'description': 'Complete urine analysis',
                'normal_range': {
                    'Color': {'unit': '', 'range': 'Yellow', 'dataType': 'text', 'required': True},
                    'Appearance': {'unit': '', 'range': 'Clear', 'dataType': 'text', 'required': True},
                    'pH': {'unit': '', 'min': '4.5', 'max': '8.0', 'dataType': 'numeric', 'required': True},
                    'Specific Gravity': {'unit': '', 'min': '1.005', 'max': '1.030', 'dataType': 'numeric', 'required': True},
                    'Protein': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                    'Glucose': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                    'Ketones': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                    'Blood': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                    'Bilirubin': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                    'Urobilinogen': {'unit': '', 'range': 'Normal', 'dataType': 'text', 'required': True},
                    'Nitrite': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                    'Leukocyte Esterase': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Urine Culture and Sensitivity',
                'code': 'URINE-CS',
                'sample_type': 'Midstream Urine',
                'description': 'Bacterial culture and antibiotic sensitivity',
                'normal_range': {
                    'Culture': {'unit': '', 'range': 'No growth', 'dataType': 'text', 'required': True},
                    'Sensitivity': {'unit': '', 'range': 'N/A', 'dataType': 'text', 'required': False},
                }
            },
            {
                'name': '24-Hour Urine Protein',
                'code': '24H-PROT',
                'sample_type': '24-Hour Urine',
                'description': 'Total protein in 24-hour urine collection',
                'normal_range': {
                    '24-Hour Protein': {'unit': 'mg/24hr', 'min': '0', 'max': '150', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': '24-Hour Urine Creatinine',
                'code': '24H-CREAT',
                'sample_type': '24-Hour Urine',
                'description': 'Creatinine clearance',
                'normal_range': {
                    '24-Hour Creatinine': {'unit': 'mg/24hr', 'min': '1000', 'max': '2000', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Microalbuminuria',
                'code': 'MICROALB',
                'sample_type': 'Urine',
                'description': 'Early kidney disease marker',
                'normal_range': {
                    'Microalbumin': {'unit': 'mg/L', 'min': '0', 'max': '30', 'dataType': 'numeric', 'required': True},
                    'Albumin/Creatinine Ratio': {'unit': 'mg/g', 'min': '0', 'max': '30', 'dataType': 'numeric', 'required': True},
                }
            },

            # Stool Tests
            {
                'name': 'Stool Routine Examination',
                'code': 'STOOL-RE',
                'sample_type': 'Fresh Stool',
                'description': 'Microscopic examination of stool',
                'normal_range': {
                    'Consistency': {'unit': '', 'range': 'Formed', 'dataType': 'text', 'required': True},
                    'Color': {'unit': '', 'range': 'Brown', 'dataType': 'text', 'required': True},
                    'Occult Blood': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                    'Parasites': {'unit': '', 'range': 'Not seen', 'dataType': 'text', 'required': True},
                    'Ova': {'unit': '', 'range': 'Not seen', 'dataType': 'text', 'required': True},
                    'Cysts': {'unit': '', 'range': 'Not seen', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Stool Culture',
                'code': 'STOOL-CS',
                'sample_type': 'Fresh Stool',
                'description': 'Bacterial culture and sensitivity',
                'normal_range': {
                    'Culture': {'unit': '', 'range': 'No pathogenic organisms', 'dataType': 'text', 'required': True},
                    'Sensitivity': {'unit': '', 'range': 'N/A', 'dataType': 'text', 'required': False},
                }
            },
            {
                'name': 'Occult Blood in Stool',
                'code': 'FOBT',
                'sample_type': 'Stool',
                'description': 'Detection of hidden blood',
                'normal_range': {
                    'Occult Blood': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                }
            },

            # Microbiology Tests
            {
                'name': 'Blood Culture',
                'code': 'BLOOD-CS',
                'sample_type': 'Blood',
                'description': 'Bacterial culture from blood',
                'normal_range': {
                    'Culture': {'unit': '', 'range': 'No growth', 'dataType': 'text', 'required': True},
                    'Sensitivity': {'unit': '', 'range': 'N/A', 'dataType': 'text', 'required': False},
                }
            },
            {
                'name': 'Sputum Culture',
                'code': 'SPUTUM-CS',
                'sample_type': 'Sputum',
                'description': 'Bacterial culture from sputum',
                'normal_range': {
                    'Culture': {'unit': '', 'range': 'Normal flora', 'dataType': 'text', 'required': True},
                    'Sensitivity': {'unit': '', 'range': 'N/A', 'dataType': 'text', 'required': False},
                }
            },
            {
                'name': 'Throat Swab Culture',
                'code': 'THROAT-CS',
                'sample_type': 'Throat Swab',
                'description': 'Bacterial culture from throat',
                'normal_range': {
                    'Culture': {'unit': '', 'range': 'Normal flora', 'dataType': 'text', 'required': True},
                    'Sensitivity': {'unit': '', 'range': 'N/A', 'dataType': 'text', 'required': False},
                }
            },
            {
                'name': 'Wound Swab Culture',
                'code': 'WOUND-CS',
                'sample_type': 'Wound Swab',
                'description': 'Bacterial culture from wound',
                'normal_range': {
                    'Culture': {'unit': '', 'range': 'No growth', 'dataType': 'text', 'required': True},
                    'Sensitivity': {'unit': '', 'range': 'N/A', 'dataType': 'text', 'required': False},
                }
            },
            {
                'name': 'Gram Stain',
                'code': 'GRAM',
                'sample_type': 'Various',
                'description': 'Bacterial identification',
                'normal_range': {
                    'Result': {'unit': '', 'range': 'No organisms seen', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'AFB (Acid Fast Bacilli) Smear',
                'code': 'AFB',
                'sample_type': 'Sputum',
                'description': 'Tuberculosis detection',
                'normal_range': {
                    'AFB': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Malaria Parasite (MP)',
                'code': 'MP',
                'sample_type': 'EDTA Blood',
                'description': 'Malaria detection',
                'normal_range': {
                    'Malaria Parasite': {'unit': '', 'range': 'Not detected', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Rapid Malaria Test',
                'code': 'RDT-MAL',
                'sample_type': 'Whole Blood',
                'description': 'Rapid diagnostic test for malaria',
                'normal_range': {
                    'Result': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Dengue NS1 Antigen',
                'code': 'DENGUE-NS1',
                'sample_type': 'Serum',
                'description': 'Dengue fever detection',
                'normal_range': {
                    'NS1 Antigen': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Dengue IgM/IgG',
                'code': 'DENGUE-IG',
                'sample_type': 'Serum',
                'description': 'Dengue antibody detection',
                'normal_range': {
                    'IgM': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                    'IgG': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Typhoid IgM/IgG',
                'code': 'TYPHOID',
                'sample_type': 'Serum',
                'description': 'Typhoid antibody detection',
                'normal_range': {
                    'IgM': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                    'IgG': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'H. Pylori Antigen',
                'code': 'HPYLORI',
                'sample_type': 'Stool',
                'description': 'Helicobacter pylori detection',
                'normal_range': {
                    'H. Pylori Antigen': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'H. Pylori Antibody',
                'code': 'HPYLORI-AB',
                'sample_type': 'Serum',
                'description': 'Helicobacter pylori antibody',
                'normal_range': {
                    'H. Pylori Antibody': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'HIV Screening',
                'code': 'HIV',
                'sample_type': 'Serum',
                'description': 'HIV antibody/antigen test',
                'normal_range': {
                    'HIV': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'HBsAg (Hepatitis B Surface Antigen)',
                'code': 'HBSAG',
                'sample_type': 'Serum',
                'description': 'Hepatitis B infection marker',
                'normal_range': {
                    'HBsAg': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Anti-HBs (Hepatitis B Antibody)',
                'code': 'ANTI-HBS',
                'sample_type': 'Serum',
                'description': 'Hepatitis B immunity marker',
                'normal_range': {
                    'Anti-HBs': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Anti-HCV (Hepatitis C Antibody)',
                'code': 'ANTI-HCV',
                'sample_type': 'Serum',
                'description': 'Hepatitis C infection marker',
                'normal_range': {
                    'Anti-HCV': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Hepatitis A IgM',
                'code': 'HAV-IGM',
                'sample_type': 'Serum',
                'description': 'Acute Hepatitis A marker',
                'normal_range': {
                    'HAV IgM': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Hepatitis A IgG',
                'code': 'HAV-IGG',
                'sample_type': 'Serum',
                'description': 'Hepatitis A immunity marker',
                'normal_range': {
                    'HAV IgG': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'VDRL (Syphilis Screening)',
                'code': 'VDRL',
                'sample_type': 'Serum',
                'description': 'Syphilis screening test',
                'normal_range': {
                    'VDRL': {'unit': '', 'range': 'Non-reactive', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'TPHA (Syphilis Confirmation)',
                'code': 'TPHA',
                'sample_type': 'Serum',
                'description': 'Syphilis confirmation test',
                'normal_range': {
                    'TPHA': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Chlamydia PCR',
                'code': 'CHLAMYDIA',
                'sample_type': 'Urethral/Vaginal Swab',
                'description': 'Chlamydia trachomatis detection',
                'normal_range': {
                    'Chlamydia': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Gonorrhea PCR',
                'code': 'GONORRHEA',
                'sample_type': 'Urethral/Vaginal Swab',
                'description': 'Neisseria gonorrhoeae detection',
                'normal_range': {
                    'Gonorrhea': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                }
            },

            # Additional templates with parameters (manually added)
            {
                'name': 'Anti-HCV (Hepatitis C)',
                'code': 'ANTI_HCV',
                'sample_type': 'Blood',
                'description': 'Hepatitis C virus antibody test',
                'normal_range': {
                    'Anti-HCV': {'unit': '', 'min': '', 'max': 'Negative', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Ascitic Fluid Analysis',
                'code': 'ASCITIC_FLUID',
                'sample_type': 'Ascitic Fluid',
                'description': 'Analysis of peritoneal fluid',
                'normal_range': {
                    'Appearance': {'unit': '', 'min': '', 'max': 'Clear', 'dataType': 'text', 'required': True},
                    'Protein': {'unit': 'g/dL', 'min': '0', 'max': '2.5', 'dataType': 'numeric', 'required': True},
                    'SAAG': {'unit': 'g/dL', 'min': '1.1', 'max': '', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Bleeding Time & Clotting Time',
                'code': 'BT_CT',
                'sample_type': 'Blood',
                'description': 'Assessment of primary and secondary hemostasis',
                'normal_range': {
                    'Bleeding Time': {'unit': 'minutes', 'min': '2', 'max': '7', 'dataType': 'numeric', 'required': True},
                    'Clotting Time': {'unit': 'minutes', 'min': '5', 'max': '15', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Blood Culture & Sensitivity',
                'code': 'BLOOD_CS',
                'sample_type': 'Blood',
                'description': 'Blood culture for microbial identification',
                'normal_range': {
                    'Organism': {'unit': '', 'min': '', 'max': 'No growth', 'dataType': 'text', 'required': True},
                    'Time to Positivity': {'unit': 'hours', 'min': '', 'max': '', 'dataType': 'numeric', 'required': False},
                }
            },
            {
                'name': 'Blood Film for Malaria Parasite',
                'code': 'BLOOD_FILM',
                'sample_type': 'Blood',
                'description': 'Microscopic examination for malaria parasites',
                'normal_range': {
                    'Malaria Parasite': {'unit': '', 'min': '', 'max': 'Not seen', 'dataType': 'text', 'required': True},
                    'Parasitemia': {'unit': '%', 'min': '0', 'max': '0', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Bone Marrow Aspiration',
                'code': 'BONE_MARROW',
                'sample_type': 'Bone Marrow',
                'description': 'Bone marrow examination for hematological disorders',
                'normal_range': {
                    'Cellularity': {'unit': '', 'min': '', 'max': 'Normal', 'dataType': 'text', 'required': True},
                    'Myeloid:Erythroid Ratio': {'unit': '', 'min': '', 'max': '2-4:1', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'CSF Analysis',
                'code': 'CSF_ANALYSIS',
                'sample_type': 'CSF',
                'description': 'Cerebrospinal fluid examination',
                'normal_range': {
                    'Appearance': {'unit': '', 'min': '', 'max': 'Clear', 'dataType': 'text', 'required': True},
                    'Protein': {'unit': 'mg/dL', 'min': '15', 'max': '45', 'dataType': 'numeric', 'required': True},
                    'Glucose': {'unit': 'mg/dL', 'min': '40', 'max': '80', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Coagulation Profile',
                'code': 'COAG',
                'sample_type': 'Blood',
                'description': 'Assessment of blood clotting function',
                'normal_range': {
                    'PT': {'unit': 'seconds', 'min': '11', 'max': '13', 'dataType': 'numeric', 'required': True},
                    'INR': {'unit': '', 'min': '0.8', 'max': '1.1', 'dataType': 'numeric', 'required': True},
                    'PTT': {'unit': 'seconds', 'min': '25', 'max': '35', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'DHEA-S',
                'code': 'DHEA_S',
                'sample_type': 'Blood',
                'description': 'Dehydroepiandrosterone sulfate hormone test',
                'normal_range': {
                    'DHEA-S': {'unit': 'μg/dL', 'min': '160', 'max': '449', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'FSH & LH',
                'code': 'FSH_LH',
                'sample_type': 'Blood',
                'description': 'Follicle stimulating hormone and luteinizing hormone',
                'normal_range': {
                    'FSH': {'unit': 'mIU/mL', 'min': '2.5', 'max': '10.2', 'dataType': 'numeric', 'required': True},
                    'LH': {'unit': 'mIU/mL', 'min': '1.9', 'max': '12.5', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Folic Acid',
                'code': 'FOLIC_ACID',
                'sample_type': 'Blood',
                'description': 'Folic acid (folate) level assessment',
                'normal_range': {
                    'Folic Acid': {'unit': 'ng/mL', 'min': '4.0', 'max': '', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Iron Profile',
                'code': 'IRON_PROFILE',
                'sample_type': 'Blood',
                'description': 'Comprehensive iron metabolism assessment',
                'normal_range': {
                    'Iron': {'unit': 'μg/dL', 'min': '65', 'max': '175', 'dataType': 'numeric', 'required': True},
                    'TIBC': {'unit': 'μg/dL', 'min': '250', 'max': '450', 'dataType': 'numeric', 'required': True},
                    'Ferritin': {'unit': 'ng/mL', 'min': '30', 'max': '300', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Magnesium',
                'code': 'MAGNESIUM',
                'sample_type': 'Blood',
                'description': 'Magnesium level assessment',
                'normal_range': {
                    'Magnesium': {'unit': 'mg/dL', 'min': '1.7', 'max': '2.2', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Pap Smear',
                'code': 'PAP_SMEAR',
                'sample_type': 'Cervical Smear',
                'description': 'Cervical cytology screening',
                'normal_range': {
                    'Result': {'unit': '', 'min': '', 'max': 'Negative for malignancy', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Phosphorus',
                'code': 'PHOSPHORUS',
                'sample_type': 'Blood',
                'description': 'Phosphorus level assessment',
                'normal_range': {
                    'Phosphorus': {'unit': 'mg/dL', 'min': '2.5', 'max': '4.5', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Platelet Count',
                'code': 'PLATELET',
                'sample_type': 'Blood',
                'description': 'Platelet count assessment',
                'normal_range': {
                    'Platelets': {'unit': '×10³/μL', 'min': '150', 'max': '450', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Pleural Fluid Analysis',
                'code': 'PLEURAL_FLUID',
                'sample_type': 'Pleural Fluid',
                'description': 'Pleural effusion examination',
                'normal_range': {
                    'Appearance': {'unit': '', 'min': '', 'max': 'Clear', 'dataType': 'text', 'required': True},
                    'Protein': {'unit': 'g/dL', 'min': '', 'max': '3.0', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Post Prandial Blood Sugar',
                'code': 'PPBS',
                'sample_type': 'Blood',
                'description': 'Blood glucose level 2 hours after meal',
                'normal_range': {
                    'Glucose': {'unit': 'mg/dL', 'min': '', 'max': '140', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Progesterone',
                'code': 'PROGESTERONE',
                'sample_type': 'Blood',
                'description': 'Progesterone hormone level',
                'normal_range': {
                    'Progesterone': {'unit': 'ng/mL', 'min': '', 'max': '1.5', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Rheumatoid Factor',
                'code': 'RA_FACTOR',
                'sample_type': 'Blood',
                'description': 'Rheumatoid arthritis screening',
                'normal_range': {
                    'Rheumatoid Factor': {'unit': 'IU/mL', 'min': '', 'max': '15', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Semen Analysis',
                'code': 'SEMEN_ANALYSIS',
                'sample_type': 'Semen',
                'description': 'Semen quality assessment for fertility',
                'normal_range': {
                    'Volume': {'unit': 'mL', 'min': '2', 'max': '5', 'dataType': 'numeric', 'required': True},
                    'Count': {'unit': 'million/mL', 'min': '15', 'max': '200', 'dataType': 'numeric', 'required': True},
                    'Motility': {'unit': '%', 'min': '50', 'max': '', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Sputum Acid Fast Bacilli',
                'code': 'SPUTUM_AFB',
                'sample_type': 'Sputum',
                'description': 'Tuberculosis screening',
                'normal_range': {
                    'AFB': {'unit': '', 'min': '', 'max': 'Negative', 'dataType': 'text', 'required': True},
                    'ZN Stain': {'unit': '', 'min': '', 'max': 'Negative', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Stool Culture & Sensitivity',
                'code': 'STOOL_CS',
                'sample_type': 'Stool',
                'description': 'Stool culture for pathogen identification',
                'normal_range': {
                    'Organism': {'unit': '', 'min': '', 'max': 'No pathogen', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Stool Microscopy',
                'code': 'STOOL_MICRO',
                'sample_type': 'Stool',
                'description': 'Microscopic examination of stool',
                'normal_range': {
                    'Ova': {'unit': '', 'min': '', 'max': 'Not seen', 'dataType': 'text', 'required': True},
                    'Cysts': {'unit': '', 'min': '', 'max': 'Not seen', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Synovial Fluid Analysis',
                'code': 'SYNOVIAL_FLUID',
                'sample_type': 'Synovial Fluid',
                'description': 'Joint fluid examination',
                'normal_range': {
                    'WBC': {'unit': '/μL', 'min': '', 'max': '200', 'dataType': 'numeric', 'required': True},
                    'PMN': {'unit': '%', 'min': '', 'max': '25', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'T3 & T4',
                'code': 'T3_T4',
                'sample_type': 'Blood',
                'description': 'Thyroid hormone levels',
                'normal_range': {
                    'T3': {'unit': 'ng/dL', 'min': '60', 'max': '181', 'dataType': 'numeric', 'required': True},
                    'T4': {'unit': 'μg/dL', 'min': '4.5', 'max': '11.2', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Testosterone',
                'code': 'TESTOSTERONE',
                'sample_type': 'Blood',
                'description': 'Testosterone hormone level',
                'normal_range': {
                    'Testosterone': {'unit': 'ng/dL', 'min': '270', 'max': '1070', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Throat Swab Culture',
                'code': 'THROAT_SWAB',
                'sample_type': 'Swab',
                'description': 'Throat culture for infection',
                'normal_range': {
                    'Organism': {'unit': '', 'min': '', 'max': 'Normal flora', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'TSH',
                'code': 'TSH',
                'sample_type': 'Blood',
                'description': 'Thyroid stimulating hormone',
                'normal_range': {
                    'TSH': {'unit': 'μIU/mL', 'min': '0.4', 'max': '4.0', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Urine Culture & Sensitivity',
                'code': 'URINE_CS',
                'sample_type': 'Urine',
                'description': 'Urine culture for urinary tract infection',
                'normal_range': {
                    'Organism': {'unit': '', 'min': '', 'max': 'No growth', 'dataType': 'text', 'required': True},
                    'Colony Count': {'unit': 'CFU/mL', 'min': '', 'max': '10,000', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Urine Microscopy',
                'code': 'URINE_MICRO',
                'sample_type': 'Urine',
                'description': 'Urine microscopic examination',
                'normal_range': {
                    'WBC': {'unit': '/hpf', 'min': '', 'max': '5', 'dataType': 'numeric', 'required': True},
                    'RBC': {'unit': '/hpf', 'min': '', 'max': '2', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Urine Routine Examination',
                'code': 'URINE_RE',
                'sample_type': 'Urine',
                'description': 'Routine urine analysis',
                'normal_range': {
                    'Protein': {'unit': '', 'min': '', 'max': 'Negative', 'dataType': 'text', 'required': True},
                    'Glucose': {'unit': '', 'min': '', 'max': 'Negative', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Vitamin B12',
                'code': 'VITAMIN_B12',
                'sample_type': 'Blood',
                'description': 'Vitamin B12 level assessment',
                'normal_range': {
                    'Vitamin B12': {'unit': 'pg/mL', 'min': '200', 'max': '900', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Vitamin D (25-OH)',
                'code': 'VITAMIN_D',
                'sample_type': 'Blood',
                'description': 'Vitamin D level assessment',
                'normal_range': {
                    '25-OH Vitamin D': {'unit': 'ng/mL', 'min': '30', 'max': '100', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Widal Test',
                'code': 'WIDAL',
                'sample_type': 'Blood',
                'description': 'Typhoid fever diagnosis',
                'normal_range': {
                    'S. Typhi O': {'unit': '', 'min': '', 'max': '1:80', 'dataType': 'text', 'required': True},
                    'S. Typhi H': {'unit': '', 'min': '', 'max': '1:160', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Wound Swab Culture',
                'code': 'WOUND_SWAB',
                'sample_type': 'Swab',
                'description': 'Wound culture for infection',
                'normal_range': {
                    'Organism': {'unit': '', 'min': '', 'max': 'No growth', 'dataType': 'text', 'required': True},
                }
            },

            # ==================== ENDOCRINOLOGY TESTS ====================
            {
                'name': 'Thyroid Function Tests (TFT)',
                'code': 'TFT',
                'category': 'endocrinology',
                'sample_type': 'Serum',
                'description': 'Comprehensive thyroid function assessment',
                'turnaround_time': '24 hours',
                'normal_range': {
                    'TSH': {'unit': 'µIU/mL', 'min': '0.4', 'max': '4.0', 'dataType': 'numeric', 'required': True},
                    'Free T4': {'unit': 'ng/dL', 'min': '0.8', 'max': '1.8', 'dataType': 'numeric', 'required': True},
                    'Free T3': {'unit': 'pg/mL', 'min': '2.3', 'max': '4.2', 'dataType': 'numeric', 'required': True},
                    'Total T4': {'unit': 'µg/dL', 'min': '4.5', 'max': '11.2', 'dataType': 'numeric', 'required': False},
                    'Total T3': {'unit': 'ng/dL', 'min': '60', 'max': '181', 'dataType': 'numeric', 'required': False},
                }
            },
            {
                'name': 'Anti-Thyroid Peroxidase (Anti-TPO)',
                'code': 'ANTI-TPO',
                'category': 'endocrinology',
                'sample_type': 'Serum',
                'description': 'Autoimmune thyroid disease marker',
                'turnaround_time': '48 hours',
                'normal_range': {
                    'Anti-TPO': {'unit': 'IU/mL', 'min': '0', 'max': '35', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Anti-Thyroglobulin Antibodies',
                'code': 'ANTI-TG',
                'category': 'endocrinology',
                'sample_type': 'Serum',
                'description': 'Thyroid autoimmune disease marker',
                'turnaround_time': '48 hours',
                'normal_range': {
                    'Anti-TG': {'unit': 'IU/mL', 'min': '0', 'max': '40', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Thyroglobulin',
                'code': 'THYROGLOBULIN',
                'category': 'endocrinology',
                'sample_type': 'Serum',
                'description': 'Thyroid cancer monitoring marker',
                'turnaround_time': '48 hours',
                'normal_range': {
                    'Thyroglobulin': {'unit': 'ng/mL', 'min': '0', 'max': '30', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Parathyroid Hormone (PTH)',
                'code': 'PTH',
                'category': 'endocrinology',
                'sample_type': 'Serum',
                'description': 'Parathyroid hormone level',
                'turnaround_time': '24 hours',
                'normal_range': {
                    'Intact PTH': {'unit': 'pg/mL', 'min': '10', 'max': '65', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Vitamin D (25-Hydroxy)',
                'code': 'VITAMIN-D-25OH',
                'category': 'endocrinology',
                'sample_type': 'Serum',
                'description': 'Active form of vitamin D',
                'turnaround_time': '48 hours',
                'normal_range': {
                    '25-OH Vitamin D': {'unit': 'ng/mL', 'min': '30', 'max': '100', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Vitamin D (1,25-Dihydroxy)',
                'code': 'VITAMIN-D-1-25',
                'category': 'endocrinology',
                'sample_type': 'Serum',
                'description': 'Active vitamin D metabolite',
                'turnaround_time': '48 hours',
                'normal_range': {
                    '1,25-OH Vitamin D': {'unit': 'pg/mL', 'min': '15', 'max': '75', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Adrenocorticotropic Hormone (ACTH)',
                'code': 'ACTH',
                'category': 'endocrinology',
                'sample_type': 'Serum',
                'description': 'Pituitary-adrenal axis assessment',
                'turnaround_time': '48 hours',
                'normal_range': {
                    'ACTH': {'unit': 'pg/mL', 'min': '7.2', 'max': '63.3', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Cortisol (Morning)',
                'code': 'CORTISOL-AM',
                'category': 'endocrinology',
                'sample_type': 'Serum',
                'description': 'Morning cortisol level',
                'turnaround_time': '24 hours',
                'normal_range': {
                    'Cortisol': {'unit': 'µg/dL', 'min': '6.2', 'max': '19.4', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Cortisol (Evening)',
                'code': 'CORTISOL-PM',
                'category': 'endocrinology',
                'sample_type': 'Serum',
                'description': 'Evening cortisol level',
                'turnaround_time': '24 hours',
                'normal_range': {
                    'Cortisol': {'unit': 'µg/dL', 'min': '2.3', 'max': '11.9', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'DHEA-Sulfate',
                'code': 'DHEA-S',
                'category': 'endocrinology',
                'sample_type': 'Serum',
                'description': 'Adrenal androgen precursor',
                'turnaround_time': '48 hours',
                'normal_range': {
                    'DHEA-S': {'unit': 'µg/dL', 'min': '35', 'max': '430', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': '17-Hydroxyprogesterone',
                'code': '17-OHP',
                'category': 'endocrinology',
                'sample_type': 'Serum',
                'description': 'Steroid hormone precursor',
                'turnaround_time': '48 hours',
                'normal_range': {
                    '17-OHP': {'unit': 'ng/dL', 'min': '0.06', 'max': '3.0', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Aldosterone',
                'code': 'ALDOSTERONE',
                'category': 'endocrinology',
                'sample_type': 'Serum',
                'description': 'Mineralocorticoid hormone',
                'turnaround_time': '48 hours',
                'normal_range': {
                    'Aldosterone': {'unit': 'ng/dL', 'min': '0', 'max': '30', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Renin Activity',
                'code': 'PLASMA-RENIN',
                'category': 'endocrinology',
                'sample_type': 'Plasma',
                'description': 'Plasma renin activity',
                'turnaround_time': '48 hours',
                'normal_range': {
                    'PRA': {'unit': 'ng/mL/hr', 'min': '0.25', 'max': '5.82', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Growth Hormone (GH)',
                'code': 'GH',
                'category': 'endocrinology',
                'sample_type': 'Serum',
                'description': 'Growth hormone level',
                'turnaround_time': '48 hours',
                'normal_range': {
                    'GH': {'unit': 'ng/mL', 'min': '0', 'max': '10', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Insulin-like Growth Factor 1 (IGF-1)',
                'code': 'IGF-1',
                'category': 'endocrinology',
                'sample_type': 'Serum',
                'description': 'Growth hormone mediator',
                'turnaround_time': '48 hours',
                'normal_range': {
                    'IGF-1': {'unit': 'ng/mL', 'min': '50', 'max': '350', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Prolactin',
                'code': 'PROLACTIN',
                'category': 'endocrinology',
                'sample_type': 'Serum',
                'description': 'Lactation hormone',
                'turnaround_time': '24 hours',
                'normal_range': {
                    'Prolactin': {'unit': 'ng/mL', 'min': '4', 'max': '23', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Beta-HCG (Quantitative)',
                'code': 'BETA-HCG',
                'category': 'endocrinology',
                'sample_type': 'Serum',
                'description': 'Pregnancy hormone quantitative measurement',
                'turnaround_time': '4 hours',
                'normal_range': {
                    'Beta-HCG': {'unit': 'mIU/mL', 'min': '0', 'max': '5', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Free Beta-HCG',
                'code': 'FREE-BETA-HCG',
                'category': 'endocrinology',
                'sample_type': 'Serum',
                'description': 'Free beta-HCG for prenatal screening',
                'turnaround_time': '24 hours',
                'normal_range': {
                    'Free Beta-HCG': {'unit': 'ng/mL', 'min': '0', 'max': '0.5', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Alpha-Fetoprotein (AFP)',
                'code': 'AFP',
                'category': 'endocrinology',
                'sample_type': 'Serum',
                'description': 'Fetal protein marker',
                'turnaround_time': '24 hours',
                'normal_range': {
                    'AFP': {'unit': 'ng/mL', 'min': '0', 'max': '15', 'dataType': 'numeric', 'required': True},
                }
            },

            # ==================== IMMUNOLOGY TESTS ====================
            {
                'name': 'C-Reactive Protein (CRP)',
                'code': 'CRP',
                'category': 'immunology',
                'sample_type': 'Serum',
                'description': 'Inflammation marker',
                'turnaround_time': '4 hours',
                'normal_range': {
                    'CRP': {'unit': 'mg/L', 'min': '0', 'max': '3.0', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Erythrocyte Sedimentation Rate (ESR)',
                'code': 'ESR',
                'category': 'immunology',
                'sample_type': 'Whole Blood',
                'description': 'Non-specific inflammation marker',
                'turnaround_time': '1 hour',
                'normal_range': {
                    'ESR': {'unit': 'mm/hr', 'min': '0', 'max': '20', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Rheumatoid Factor (RF)',
                'code': 'RF',
                'category': 'immunology',
                'sample_type': 'Serum',
                'description': 'Autoimmune disease marker',
                'turnaround_time': '24 hours',
                'normal_range': {
                    'RF': {'unit': 'IU/mL', 'min': '0', 'max': '20', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Anti-Nuclear Antibody (ANA)',
                'code': 'ANA',
                'category': 'immunology',
                'sample_type': 'Serum',
                'description': 'Systemic autoimmune disease screening',
                'turnaround_time': '48 hours',
                'normal_range': {
                    'ANA': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                    'Titer': {'unit': '', 'range': '<1:40', 'dataType': 'text', 'required': False},
                    'Pattern': {'unit': '', 'range': 'N/A', 'dataType': 'text', 'required': False},
                }
            },
            {
                'name': 'Anti-dsDNA Antibodies',
                'code': 'ANTI-DSDNA',
                'category': 'immunology',
                'sample_type': 'Serum',
                'description': 'Systemic lupus erythematosus marker',
                'turnaround_time': '48 hours',
                'normal_range': {
                    'Anti-dsDNA': {'unit': 'IU/mL', 'min': '0', 'max': '25', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Anti-Smith Antibodies',
                'code': 'ANTI-SMITH',
                'category': 'immunology',
                'sample_type': 'Serum',
                'description': 'SLE specific antibody',
                'turnaround_time': '48 hours',
                'normal_range': {
                    'Anti-Smith': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Antineutrophil Cytoplasmic Antibodies (ANCA)',
                'code': 'ANCA',
                'category': 'immunology',
                'sample_type': 'Serum',
                'description': 'Vasculitis marker',
                'turnaround_time': '48 hours',
                'normal_range': {
                    'c-ANCA (PR3)': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                    'p-ANCA (MPO)': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Complement C3',
                'code': 'C3',
                'category': 'immunology',
                'sample_type': 'Serum',
                'description': 'Complement system component',
                'turnaround_time': '24 hours',
                'normal_range': {
                    'C3': {'unit': 'mg/dL', 'min': '90', 'max': '180', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Complement C4',
                'code': 'C4',
                'category': 'immunology',
                'sample_type': 'Serum',
                'description': 'Complement system component',
                'turnaround_time': '24 hours',
                'normal_range': {
                    'C4': {'unit': 'mg/dL', 'min': '10', 'max': '40', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Immunoglobulin G (IgG)',
                'code': 'IGG',
                'category': 'immunology',
                'sample_type': 'Serum',
                'description': 'Immunoglobulin G quantification',
                'turnaround_time': '48 hours',
                'normal_range': {
                    'IgG': {'unit': 'mg/dL', 'min': '700', 'max': '1600', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Immunoglobulin A (IgA)',
                'code': 'IGA',
                'category': 'immunology',
                'sample_type': 'Serum',
                'description': 'Immunoglobulin A quantification',
                'turnaround_time': '48 hours',
                'normal_range': {
                    'IgA': {'unit': 'mg/dL', 'min': '70', 'max': '400', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Immunoglobulin M (IgM)',
                'code': 'IGM',
                'category': 'immunology',
                'sample_type': 'Serum',
                'description': 'Immunoglobulin M quantification',
                'turnaround_time': '48 hours',
                'normal_range': {
                    'IgM': {'unit': 'mg/dL', 'min': '40', 'max': '230', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Serum Protein Electrophoresis (SPEP)',
                'code': 'SPEP',
                'category': 'immunology',
                'sample_type': 'Serum',
                'description': 'Protein fractionation analysis',
                'turnaround_time': '48 hours',
                'normal_range': {
                    'Albumin': {'unit': '%', 'min': '55', 'max': '65', 'dataType': 'numeric', 'required': True},
                    'Alpha-1 Globulin': {'unit': '%', 'min': '2', 'max': '3', 'dataType': 'numeric', 'required': True},
                    'Alpha-2 Globulin': {'unit': '%', 'min': '7', 'max': '11', 'dataType': 'numeric', 'required': True},
                    'Beta Globulin': {'unit': '%', 'min': '8', 'max': '12', 'dataType': 'numeric', 'required': True},
                    'Gamma Globulin': {'unit': '%', 'min': '11', 'max': '18', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Free Light Chains (Kappa & Lambda)',
                'code': 'FREE-LIGHT-CHAINS',
                'category': 'immunology',
                'sample_type': 'Serum',
                'description': 'Monoclonal gammopathy assessment',
                'turnaround_time': '48 hours',
                'normal_range': {
                    'Free Kappa': {'unit': 'mg/L', 'min': '3.3', 'max': '19.4', 'dataType': 'numeric', 'required': True},
                    'Free Lambda': {'unit': 'mg/L', 'min': '5.7', 'max': '26.3', 'dataType': 'numeric', 'required': True},
                    'Kappa/Lambda Ratio': {'unit': '', 'min': '0.26', 'max': '1.65', 'dataType': 'numeric', 'required': True},
                }
            },

            # ==================== TOXICOLOGY TESTS ====================
            {
                'name': 'Drug Screen (Urine)',
                'code': 'DRUG-SCREEN-URINE',
                'category': 'toxicology',
                'sample_type': 'Urine',
                'description': 'Multi-panel drug screening',
                'turnaround_time': '4 hours',
                'normal_range': {
                    'Amphetamines': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                    'Barbiturates': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                    'Benzodiazepines': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                    'Cannabis': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                    'Cocaine': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                    'Opiates': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Alcohol (Ethanol)',
                'code': 'ETHANOL',
                'category': 'toxicology',
                'sample_type': 'Blood',
                'description': 'Blood alcohol concentration',
                'turnaround_time': '1 hour',
                'normal_range': {
                    'Ethanol': {'unit': 'mg/dL', 'min': '0', 'max': '0', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Carbon Monoxide (CO)',
                'code': 'CARBOXYHEMOGLOBIN',
                'category': 'toxicology',
                'sample_type': 'Blood',
                'description': 'Carboxyhemoglobin level',
                'turnaround_time': '1 hour',
                'normal_range': {
                    'Carboxyhemoglobin': {'unit': '%', 'min': '0', 'max': '2', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Heavy Metals Panel',
                'code': 'HEAVY-METALS',
                'category': 'toxicology',
                'sample_type': 'Blood',
                'description': 'Toxic heavy metals assessment',
                'turnaround_time': '72 hours',
                'normal_range': {
                    'Lead': {'unit': 'µg/dL', 'min': '0', 'max': '5', 'dataType': 'numeric', 'required': True},
                    'Mercury': {'unit': 'µg/L', 'min': '0', 'max': '10', 'dataType': 'numeric', 'required': True},
                    'Arsenic': {'unit': 'µg/L', 'min': '0', 'max': '50', 'dataType': 'numeric', 'required': True},
                }
            },

            # ==================== CYTOLOGY TESTS ====================
            {
                'name': 'Cerebrospinal Fluid (CSF) Analysis',
                'code': 'CSF-ANALYSIS',
                'category': 'cytology',
                'sample_type': 'CSF',
                'description': 'Cerebrospinal fluid examination',
                'turnaround_time': '4 hours',
                'normal_range': {
                    'Appearance': {'unit': '', 'range': 'Clear', 'dataType': 'text', 'required': True},
                    'Color': {'unit': '', 'range': 'Colorless', 'dataType': 'text', 'required': True},
                    'WBC Count': {'unit': '/µL', 'min': '0', 'max': '5', 'dataType': 'numeric', 'required': True},
                    'Protein': {'unit': 'mg/dL', 'min': '15', 'max': '45', 'dataType': 'numeric', 'required': True},
                    'Glucose': {'unit': 'mg/dL', 'min': '40', 'max': '80', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Synovial Fluid Analysis',
                'code': 'SYNOVIAL-FLUID',
                'category': 'cytology',
                'sample_type': 'Synovial Fluid',
                'description': 'Joint fluid examination',
                'turnaround_time': '24 hours',
                'normal_range': {
                    'Appearance': {'unit': '', 'range': 'Clear', 'dataType': 'text', 'required': True},
                    'WBC Count': {'unit': '/µL', 'min': '0', 'max': '200', 'dataType': 'numeric', 'required': True},
                    'PMN': {'unit': '%', 'min': '0', 'max': '25', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Pericardial Fluid Analysis',
                'code': 'PERICARDIAL-FLUID',
                'category': 'cytology',
                'sample_type': 'Pericardial Fluid',
                'description': 'Pericardial effusion examination',
                'turnaround_time': '24 hours',
                'normal_range': {
                    'Appearance': {'unit': '', 'range': 'Clear', 'dataType': 'text', 'required': True},
                    'Protein': {'unit': 'g/dL', 'min': '0.1', 'max': '3.0', 'dataType': 'numeric', 'required': True},
                    'LDH': {'unit': 'U/L', 'min': '0', 'max': '200', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Bronchoalveolar Lavage (BAL)',
                'code': 'BAL',
                'category': 'cytology',
                'sample_type': 'Bronchoalveolar Lavage',
                'description': 'Bronchial washing analysis',
                'turnaround_time': '48 hours',
                'normal_range': {
                    'Total Cells': {'unit': 'x10³/µL', 'min': '0', 'max': '200', 'dataType': 'numeric', 'required': True},
                    'Macrophages': {'unit': '%', 'min': '80', 'max': '95', 'dataType': 'numeric', 'required': True},
                    'Lymphocytes': {'unit': '%', 'min': '5', 'max': '15', 'dataType': 'numeric', 'required': True},
                    'Neutrophils': {'unit': '%', 'min': '0', 'max': '3', 'dataType': 'numeric', 'required': True},
                    'Eosinophils': {'unit': '%', 'min': '0', 'max': '1', 'dataType': 'numeric', 'required': True},
                }
            },

            # ==================== HISTOPATHOLOGY TESTS ====================
            {
                'name': 'Skin Biopsy',
                'code': 'SKIN-BIOPSY',
                'category': 'histopathology',
                'sample_type': 'Tissue',
                'description': 'Skin tissue examination',
                'turnaround_time': '72 hours',
                'normal_range': {
                    'Diagnosis': {'unit': '', 'range': 'Normal skin', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Liver Biopsy',
                'code': 'LIVER-BIOPSY',
                'category': 'histopathology',
                'sample_type': 'Liver Tissue',
                'description': 'Liver tissue examination',
                'turnaround_time': '72 hours',
                'normal_range': {
                    'Diagnosis': {'unit': '', 'range': 'Normal liver tissue', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Kidney Biopsy',
                'code': 'KIDNEY-BIOPSY',
                'category': 'histopathology',
                'sample_type': 'Kidney Tissue',
                'description': 'Kidney tissue examination',
                'turnaround_time': '72 hours',
                'normal_range': {
                    'Diagnosis': {'unit': '', 'range': 'Normal kidney tissue', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Lymph Node Biopsy',
                'code': 'LYMPH-NODE-BIOPSY',
                'category': 'histopathology',
                'sample_type': 'Lymph Node Tissue',
                'description': 'Lymph node tissue examination',
                'turnaround_time': '72 hours',
                'normal_range': {
                    'Diagnosis': {'unit': '', 'range': 'Reactive hyperplasia', 'dataType': 'text', 'required': True},
                }
            },

            # ==================== MOLECULAR BIOLOGY TESTS ====================
            {
                'name': 'Hepatitis B Virus DNA',
                'code': 'HBV-DNA',
                'category': 'molecular',
                'sample_type': 'Blood',
                'description': 'HBV viral load quantification',
                'turnaround_time': '48 hours',
                'normal_range': {
                    'HBV DNA': {'unit': 'IU/mL', 'min': '0', 'max': '20', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Hepatitis C Virus RNA',
                'code': 'HCV-RNA',
                'category': 'molecular',
                'sample_type': 'Blood',
                'description': 'HCV viral load quantification',
                'turnaround_time': '48 hours',
                'normal_range': {
                    'HCV RNA': {'unit': 'IU/mL', 'min': '0', 'max': '15', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'HIV Viral Load',
                'code': 'HIV-VIRAL-LOAD',
                'category': 'molecular',
                'sample_type': 'Blood',
                'description': 'HIV RNA quantification',
                'turnaround_time': '48 hours',
                'normal_range': {
                    'HIV RNA': {'unit': 'copies/mL', 'min': '0', 'max': '20', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Cytomegalovirus (CMV) PCR',
                'code': 'CMV-PCR',
                'category': 'molecular',
                'sample_type': 'Blood',
                'description': 'CMV DNA detection and quantification',
                'turnaround_time': '48 hours',
                'normal_range': {
                    'CMV DNA': {'unit': 'IU/mL', 'min': '0', 'max': '137', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Epstein-Barr Virus (EBV) PCR',
                'code': 'EBV-PCR',
                'category': 'molecular',
                'sample_type': 'Blood',
                'description': 'EBV DNA detection',
                'turnaround_time': '48 hours',
                'normal_range': {
                    'EBV DNA': {'unit': '', 'range': 'Not detected', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Chlamydia trachomatis PCR',
                'code': 'CHLAMYDIA-PCR',
                'category': 'molecular',
                'sample_type': 'Urine/Swab',
                'description': 'Chlamydia DNA detection',
                'turnaround_time': '24 hours',
                'normal_range': {
                    'Chlamydia': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Neisseria gonorrhoeae PCR',
                'code': 'GONORRHEA-PCR',
                'category': 'molecular',
                'sample_type': 'Urine/Swab',
                'description': 'Gonorrhea DNA detection',
                'turnaround_time': '24 hours',
                'normal_range': {
                    'Gonorrhea': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Human Papillomavirus (HPV) DNA',
                'code': 'HPV-DNA',
                'category': 'molecular',
                'sample_type': 'Cervical Swab',
                'description': 'HPV genotyping',
                'turnaround_time': '48 hours',
                'normal_range': {
                    'HPV': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                    'Genotype': {'unit': '', 'range': 'N/A', 'dataType': 'text', 'required': False},
                }
            },

            # ==================== ADDITIONAL HEMATOLOGY TESTS ====================
            {
                'name': 'Blood Film Comment',
                'code': 'BLOOD-FILM-COMMENT',
                'category': 'hematology',
                'sample_type': 'EDTA Blood',
                'description': 'Blood film examination with morphological assessment',
                'turnaround_time': '2 hours',
                'normal_range': {
                    'Blood Film Comment': {'unit': '', 'range': 'Normal blood film', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Blood Indices',
                'code': 'BLOOD-INDICES',
                'category': 'hematology',
                'sample_type': 'EDTA Blood',
                'description': 'Red cell indices calculation',
                'turnaround_time': '1 hour',
                'normal_range': {
                    'MCV': {'unit': 'fL', 'min': '80', 'max': '100', 'dataType': 'numeric', 'required': True},
                    'MCH': {'unit': 'pg', 'min': '27', 'max': '32', 'dataType': 'numeric', 'required': True},
                    'MCHC': {'unit': 'g/dL', 'min': '32', 'max': '36', 'dataType': 'numeric', 'required': True},
                    'RDW': {'unit': '%', 'min': '11.5', 'max': '14.5', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Folate (Red Cell)',
                'code': 'FOLATE-RBC',
                'category': 'hematology',
                'sample_type': 'EDTA Blood',
                'description': 'Red cell folate level',
                'turnaround_time': '48 hours',
                'normal_range': {
                    'Red Cell Folate': {'unit': 'ng/mL', 'min': '150', 'max': '600', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Vitamin B12 (Active)',
                'code': 'B12-ACTIVE',
                'category': 'hematology',
                'sample_type': 'Serum',
                'description': 'Active vitamin B12 level',
                'turnaround_time': '24 hours',
                'normal_range': {
                    'Active B12': {'unit': 'pmol/L', 'min': '25', 'max': '165', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Homocysteine',
                'code': 'HOMOCYSTEINE',
                'category': 'hematology',
                'sample_type': 'Serum',
                'description': 'Homocysteine level (cardiovascular risk marker)',
                'turnaround_time': '24 hours',
                'normal_range': {
                    'Homocysteine': {'unit': 'µmol/L', 'min': '0', 'max': '15', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Methylmalonic Acid',
                'code': 'MMA',
                'category': 'hematology',
                'sample_type': 'Serum',
                'description': 'Methylmalonic acid (B12 deficiency marker)',
                'turnaround_time': '48 hours',
                'normal_range': {
                    'Methylmalonic Acid': {'unit': 'nmol/L', 'min': '0', 'max': '280', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Ferritin',
                'code': 'FERRITIN',
                'category': 'hematology',
                'sample_type': 'Serum',
                'description': 'Ferritin level (iron stores)',
                'turnaround_time': '24 hours',
                'normal_range': {
                    'Ferritin': {'unit': 'ng/mL', 'min': '15', 'max': '200', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Transferrin',
                'code': 'TRANSFERRIN',
                'category': 'hematology',
                'sample_type': 'Serum',
                'description': 'Transferrin level',
                'turnaround_time': '24 hours',
                'normal_range': {
                    'Transferrin': {'unit': 'mg/dL', 'min': '200', 'max': '360', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Total Iron Binding Capacity (TIBC)',
                'code': 'TIBC',
                'category': 'hematology',
                'sample_type': 'Serum',
                'description': 'Total iron binding capacity',
                'turnaround_time': '24 hours',
                'normal_range': {
                    'TIBC': {'unit': 'µg/dL', 'min': '250', 'max': '400', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Unsaturated Iron Binding Capacity (UIBC)',
                'code': 'UIBC',
                'category': 'hematology',
                'sample_type': 'Serum',
                'description': 'Unsaturated iron binding capacity',
                'turnaround_time': '24 hours',
                'normal_range': {
                    'UIBC': {'unit': 'µg/dL', 'min': '150', 'max': '300', 'dataType': 'numeric', 'required': True},
                }
            },

            # ==================== ADDITIONAL CHEMISTRY TESTS ====================
            {
                'name': 'Blood Glucose (Random)',
                'code': 'GLUCOSE-RANDOM',
                'category': 'chemistry',
                'sample_type': 'Whole Blood/Plasma',
                'description': 'Random blood glucose level',
                'turnaround_time': '1 hour',
                'normal_range': {
                    'Glucose': {'unit': 'mg/dL', 'min': '70', 'max': '140', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Glycosylated Hemoglobin (HbA1c)',
                'code': 'HBA1C',
                'category': 'chemistry',
                'sample_type': 'EDTA Blood',
                'description': 'Glycated hemoglobin for diabetes monitoring',
                'turnaround_time': '24 hours',
                'normal_range': {
                    'HbA1c': {'unit': '%', 'min': '4.0', 'max': '5.6', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Fructosamine',
                'code': 'FRUCTOSAMINE',
                'category': 'chemistry',
                'sample_type': 'Serum',
                'description': 'Glycated protein for short-term glucose control',
                'turnaround_time': '24 hours',
                'normal_range': {
                    'Fructosamine': {'unit': 'µmol/L', 'min': '205', 'max': '285', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Microalbumin',
                'code': 'MICROALBUMIN',
                'category': 'chemistry',
                'sample_type': 'Urine',
                'description': 'Microalbuminuria test',
                'turnaround_time': '24 hours',
                'normal_range': {
                    'Microalbumin': {'unit': 'mg/L', 'min': '0', 'max': '30', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Creatinine Clearance',
                'code': 'CREAT-CLEARANCE',
                'category': 'chemistry',
                'sample_type': 'Blood/Urine',
                'description': 'Glomerular filtration rate estimation',
                'turnaround_time': '24 hours',
                'normal_range': {
                    'Creatinine Clearance': {'unit': 'mL/min', 'min': '90', 'max': '120', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Cystatin C',
                'code': 'CYSTATIN-C',
                'category': 'chemistry',
                'sample_type': 'Serum',
                'description': 'Alternative marker for kidney function',
                'turnaround_time': '24 hours',
                'normal_range': {
                    'Cystatin C': {'unit': 'mg/L', 'min': '0.5', 'max': '1.0', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Beta-2 Microglobulin',
                'code': 'BETA2-MICROGLOBULIN',
                'category': 'chemistry',
                'sample_type': 'Serum',
                'description': 'Marker for renal tubular function',
                'turnaround_time': '48 hours',
                'normal_range': {
                    'Beta-2 Microglobulin': {'unit': 'mg/L', 'min': '0.7', 'max': '1.8', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Lipase',
                'code': 'LIPASE',
                'category': 'chemistry',
                'sample_type': 'Serum',
                'description': 'Pancreatic enzyme',
                'turnaround_time': '4 hours',
                'normal_range': {
                    'Lipase': {'unit': 'U/L', 'min': '10', 'max': '73', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Amylase',
                'code': 'AMYLASE',
                'category': 'chemistry',
                'sample_type': 'Serum',
                'description': 'Digestive enzyme',
                'turnaround_time': '4 hours',
                'normal_range': {
                    'Amylase': {'unit': 'U/L', 'min': '28', 'max': '100', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Troponin I',
                'code': 'TROPONIN-I',
                'category': 'chemistry',
                'sample_type': 'Serum',
                'description': 'Cardiac injury marker',
                'turnaround_time': '1 hour',
                'normal_range': {
                    'Troponin I': {'unit': 'ng/mL', 'min': '0', 'max': '0.04', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Troponin T',
                'code': 'TROPONIN-T',
                'category': 'chemistry',
                'sample_type': 'Serum',
                'description': 'Cardiac injury marker',
                'turnaround_time': '1 hour',
                'normal_range': {
                    'Troponin T': {'unit': 'ng/mL', 'min': '0', 'max': '0.01', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'CK-MB',
                'code': 'CK-MB',
                'category': 'chemistry',
                'sample_type': 'Serum',
                'description': 'Cardiac muscle enzyme',
                'turnaround_time': '4 hours',
                'normal_range': {
                    'CK-MB': {'unit': 'ng/mL', 'min': '0', 'max': '6.3', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Myoglobin',
                'code': 'MYOGLOBIN',
                'category': 'chemistry',
                'sample_type': 'Serum',
                'description': 'Muscle injury marker',
                'turnaround_time': '4 hours',
                'normal_range': {
                    'Myoglobin': {'unit': 'ng/mL', 'min': '0', 'max': '85', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'BNP (B-Type Natriuretic Peptide)',
                'code': 'BNP',
                'category': 'chemistry',
                'sample_type': 'Plasma',
                'description': 'Heart failure marker',
                'turnaround_time': '2 hours',
                'normal_range': {
                    'BNP': {'unit': 'pg/mL', 'min': '0', 'max': '100', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'NT-proBNP',
                'code': 'NT-PROBNP',
                'category': 'chemistry',
                'sample_type': 'Plasma',
                'description': 'Heart failure marker',
                'turnaround_time': '2 hours',
                'normal_range': {
                    'NT-proBNP': {'unit': 'pg/mL', 'min': '0', 'max': '125', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Homocysteine',
                'code': 'HOMOCYSTEINE-CHEM',
                'category': 'chemistry',
                'sample_type': 'Plasma',
                'description': 'Amino acid associated with cardiovascular risk',
                'turnaround_time': '48 hours',
                'normal_range': {
                    'Homocysteine': {'unit': 'µmol/L', 'min': '5', 'max': '15', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'C-Reactive Protein (Quantitative)',
                'code': 'CRP-QUANT',
                'category': 'chemistry',
                'sample_type': 'Serum',
                'description': 'Inflammation marker',
                'turnaround_time': '4 hours',
                'normal_range': {
                    'CRP': {'unit': 'mg/L', 'min': '0', 'max': '3.0', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'High Sensitivity CRP',
                'code': 'HS-CRP',
                'category': 'chemistry',
                'sample_type': 'Serum',
                'description': 'Cardiovascular risk marker',
                'turnaround_time': '24 hours',
                'normal_range': {
                    'hs-CRP': {'unit': 'mg/L', 'min': '0', 'max': '1.0', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Procalcitonin',
                'code': 'PROCALCITONIN',
                'category': 'chemistry',
                'sample_type': 'Serum',
                'description': 'Bacterial infection marker',
                'turnaround_time': '4 hours',
                'normal_range': {
                    'Procalcitonin': {'unit': 'ng/mL', 'min': '0', 'max': '0.25', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Lactate',
                'code': 'LACTATE',
                'category': 'chemistry',
                'sample_type': 'Whole Blood',
                'description': 'Lactic acid level',
                'turnaround_time': '1 hour',
                'normal_range': {
                    'Lactate': {'unit': 'mmol/L', 'min': '0.5', 'max': '2.2', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Osmolality',
                'code': 'OSMOLALITY',
                'category': 'chemistry',
                'sample_type': 'Serum',
                'description': 'Serum osmolality',
                'turnaround_time': '4 hours',
                'normal_range': {
                    'Osmolality': {'unit': 'mOsm/kg', 'min': '275', 'max': '295', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Anion Gap',
                'code': 'ANION-GAP',
                'category': 'chemistry',
                'sample_type': 'Serum',
                'description': 'Calculated anion gap',
                'turnaround_time': '1 hour',
                'normal_range': {
                    'Anion Gap': {'unit': 'mEq/L', 'min': '8', 'max': '16', 'dataType': 'numeric', 'required': True},
                }
            },

            # ==================== ADDITIONAL ENDOCRINOLOGY TESTS ====================
            {
                'name': 'Anti-Mullerian Hormone (AMH)',
                'code': 'AMH',
                'category': 'endocrinology',
                'sample_type': 'Serum',
                'description': 'Ovarian reserve marker',
                'turnaround_time': '48 hours',
                'normal_range': {
                    'AMH': {'unit': 'ng/mL', 'min': '1.0', 'max': '3.0', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Inhibin B',
                'code': 'INHIBIN-B',
                'category': 'endocrinology',
                'sample_type': 'Serum',
                'description': 'Testicular function marker',
                'turnaround_time': '48 hours',
                'normal_range': {
                    'Inhibin B': {'unit': 'pg/mL', 'min': '80', 'max': '400', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Sex Hormone Binding Globulin (SHBG)',
                'code': 'SHBG',
                'category': 'endocrinology',
                'sample_type': 'Serum',
                'description': 'Sex hormone binding protein',
                'turnaround_time': '48 hours',
                'normal_range': {
                    'SHBG': {'unit': 'nmol/L', 'min': '10', 'max': '50', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Free Androgen Index',
                'code': 'FAI',
                'category': 'endocrinology',
                'sample_type': 'Serum',
                'description': 'Calculated free androgen index',
                'turnaround_time': '48 hours',
                'normal_range': {
                    'FAI': {'unit': '', 'min': '0.7', 'max': '2.8', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Insulin',
                'code': 'INSULIN',
                'category': 'endocrinology',
                'sample_type': 'Serum',
                'description': 'Insulin level',
                'turnaround_time': '24 hours',
                'normal_range': {
                    'Insulin': {'unit': 'µIU/mL', 'min': '2.6', 'max': '24.9', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'C-Peptide',
                'code': 'C-PEPTIDE',
                'category': 'endocrinology',
                'sample_type': 'Serum',
                'description': 'Insulin secretion marker',
                'turnaround_time': '24 hours',
                'normal_range': {
                    'C-Peptide': {'unit': 'ng/mL', 'min': '1.1', 'max': '4.4', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Insulin Resistance (HOMA-IR)',
                'code': 'HOMA-IR',
                'category': 'endocrinology',
                'sample_type': 'Serum',
                'description': 'Homeostatic model assessment of insulin resistance',
                'turnaround_time': '24 hours',
                'normal_range': {
                    'HOMA-IR': {'unit': '', 'min': '0', 'max': '2.5', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Leptin',
                'code': 'LEPTIN',
                'category': 'endocrinology',
                'sample_type': 'Serum',
                'description': 'Adipokine hormone',
                'turnaround_time': '48 hours',
                'normal_range': {
                    'Leptin': {'unit': 'ng/mL', 'min': '3.0', 'max': '20.0', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Ghrelin',
                'code': 'GHRELIN',
                'category': 'endocrinology',
                'sample_type': 'Plasma',
                'description': 'Hunger hormone',
                'turnaround_time': '48 hours',
                'normal_range': {
                    'Ghrelin': {'unit': 'pg/mL', 'min': '400', 'max': '1000', 'dataType': 'numeric', 'required': True},
                }
            },

            # ==================== ADDITIONAL IMMUNOLOGY TESTS ====================
            {
                'name': 'Total IgE',
                'code': 'IGE-TOTAL',
                'category': 'immunology',
                'sample_type': 'Serum',
                'description': 'Total immunoglobulin E',
                'turnaround_time': '48 hours',
                'normal_range': {
                    'Total IgE': {'unit': 'IU/mL', 'min': '0', 'max': '100', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Specific IgE (Allergy Testing)',
                'code': 'IGE-SPECIFIC',
                'category': 'immunology',
                'sample_type': 'Serum',
                'description': 'Allergen-specific IgE antibodies',
                'turnaround_time': '48 hours',
                'normal_range': {
                    'Specific IgE': {'unit': 'kU/L', 'min': '0', 'max': '0.35', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Anti-CCP Antibodies',
                'code': 'ANTI-CCP',
                'category': 'immunology',
                'sample_type': 'Serum',
                'description': 'Anti-cyclic citrullinated peptide antibodies',
                'turnaround_time': '48 hours',
                'normal_range': {
                    'Anti-CCP': {'unit': 'U/mL', 'min': '0', 'max': '20', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Extractable Nuclear Antigens (ENA)',
                'code': 'ENA',
                'category': 'immunology',
                'sample_type': 'Serum',
                'description': 'Autoantibodies to nuclear antigens',
                'turnaround_time': '72 hours',
                'normal_range': {
                    'ENA Panel': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'HLA-B27',
                'code': 'HLA-B27',
                'category': 'immunology',
                'sample_type': 'Blood',
                'description': 'HLA-B27 antigen testing',
                'turnaround_time': '72 hours',
                'normal_range': {
                    'HLA-B27': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                }
            },

            # ==================== ADDITIONAL MICROBIOLOGY TESTS ====================
            {
                'name': 'Tuberculosis PCR',
                'code': 'TB-PCR',
                'category': 'microbiology',
                'sample_type': 'Sputum/Blood',
                'description': 'Mycobacterium tuberculosis DNA detection',
                'turnaround_time': '48 hours',
                'normal_range': {
                    'TB PCR': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Mycobacterium Culture',
                'code': 'MYCOBACTERIUM-CS',
                'category': 'microbiology',
                'sample_type': 'Sputum/Tissue',
                'description': 'Mycobacterial culture and sensitivity',
                'turnaround_time': '6 weeks',
                'normal_range': {
                    'Culture': {'unit': '', 'range': 'No mycobacteria isolated', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Fungal Culture',
                'code': 'FUNGAL-CS',
                'category': 'microbiology',
                'sample_type': 'Various',
                'description': 'Fungal culture and identification',
                'turnaround_time': '4 weeks',
                'normal_range': {
                    'Culture': {'unit': '', 'range': 'No fungi isolated', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Viral Culture',
                'code': 'VIRAL-CS',
                'category': 'microbiology',
                'sample_type': 'Various',
                'description': 'Viral culture and identification',
                'turnaround_time': '2 weeks',
                'normal_range': {
                    'Culture': {'unit': '', 'range': 'No viruses isolated', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Helicobacter pylori Urea Breath Test',
                'code': 'HPYLORI-UBT',
                'category': 'microbiology',
                'sample_type': 'Breath',
                'description': 'Non-invasive H. pylori detection',
                'turnaround_time': '24 hours',
                'normal_range': {
                    'UBT Result': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                }
            },

            # ==================== ADDITIONAL SEROLOGY TESTS ====================
            {
                'name': 'Toxoplasma IgG',
                'code': 'TOXOPLASMA-IGG',
                'category': 'serology',
                'sample_type': 'Serum',
                'description': 'Toxoplasma gondii IgG antibodies',
                'turnaround_time': '48 hours',
                'normal_range': {
                    'Toxoplasma IgG': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Toxoplasma IgM',
                'code': 'TOXOPLASMA-IGM',
                'category': 'serology',
                'sample_type': 'Serum',
                'description': 'Toxoplasma gondii IgM antibodies',
                'turnaround_time': '48 hours',
                'normal_range': {
                    'Toxoplasma IgM': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Rubella IgG',
                'code': 'RUBELLA-IGG',
                'category': 'serology',
                'sample_type': 'Serum',
                'description': 'Rubella virus IgG antibodies',
                'turnaround_time': '48 hours',
                'normal_range': {
                    'Rubella IgG': {'unit': 'IU/mL', 'min': '10', 'max': '', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Cytomegalovirus IgG',
                'code': 'CMV-IGG',
                'category': 'serology',
                'sample_type': 'Serum',
                'description': 'Cytomegalovirus IgG antibodies',
                'turnaround_time': '48 hours',
                'normal_range': {
                    'CMV IgG': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Cytomegalovirus IgM',
                'code': 'CMV-IGM',
                'category': 'serology',
                'sample_type': 'Serum',
                'description': 'Cytomegalovirus IgM antibodies',
                'turnaround_time': '48 hours',
                'normal_range': {
                    'CMV IgM': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                }
            },

            # ==================== URINALYSIS TESTS ====================
            {
                'name': 'Urine Protein/Creatinine Ratio',
                'code': 'UPROTEIN-CREAT',
                'category': 'urinalysis',
                'sample_type': 'Urine',
                'description': 'Protein to creatinine ratio in urine',
                'turnaround_time': '4 hours',
                'normal_range': {
                    'Protein/Creatinine Ratio': {'unit': 'mg/g', 'min': '0', 'max': '150', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Urine Calcium',
                'code': 'URINE-CALCIUM',
                'category': 'urinalysis',
                'sample_type': 'Urine (24h)',
                'description': '24-hour urine calcium excretion',
                'turnaround_time': '24 hours',
                'normal_range': {
                    'Urine Calcium': {'unit': 'mg/24h', 'min': '100', 'max': '300', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Urine Oxalate',
                'code': 'URINE-OXALATE',
                'category': 'urinalysis',
                'sample_type': 'Urine (24h)',
                'description': '24-hour urine oxalate excretion',
                'turnaround_time': '48 hours',
                'normal_range': {
                    'Urine Oxalate': {'unit': 'mg/24h', 'min': '0', 'max': '45', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Urine Citrate',
                'code': 'URINE-CITRATE',
                'category': 'urinalysis',
                'sample_type': 'Urine (24h)',
                'description': '24-hour urine citrate excretion',
                'turnaround_time': '48 hours',
                'normal_range': {
                    'Urine Citrate': {'unit': 'mg/24h', 'min': '320', 'max': '1240', 'dataType': 'numeric', 'required': True},
                }
            },
            {
                'name': 'Urine Uric Acid',
                'code': 'URINE-URIC-ACID',
                'category': 'urinalysis',
                'sample_type': 'Urine (24h)',
                'description': '24-hour urine uric acid excretion',
                'turnaround_time': '24 hours',
                'normal_range': {
                    'Urine Uric Acid': {'unit': 'mg/24h', 'min': '250', 'max': '750', 'dataType': 'numeric', 'required': True},
                }
            },

            # ==================== PARASITOLOGY TESTS ====================
            {
                'name': 'Stool for Ova and Parasites',
                'code': 'STOOL-OVA',
                'category': 'parasitology',
                'sample_type': 'Stool',
                'description': 'Microscopic examination for parasites',
                'turnaround_time': '48 hours',
                'normal_range': {
                    'Ova': {'unit': '', 'range': 'Not seen', 'dataType': 'text', 'required': True},
                    'Parasites': {'unit': '', 'range': 'Not seen', 'dataType': 'text', 'required': True},
                    'Cysts': {'unit': '', 'range': 'Not seen', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Blood Parasite Smear',
                'code': 'BLOOD-PARASITE',
                'category': 'parasitology',
                'sample_type': 'Blood',
                'description': 'Detection of blood-borne parasites',
                'turnaround_time': '4 hours',
                'normal_range': {
                    'Parasites': {'unit': '', 'range': 'Not detected', 'dataType': 'text', 'required': True},
                }
            },
            {
                'name': 'Malaria Antigen Test',
                'code': 'MALARIA-AG',
                'category': 'parasitology',
                'sample_type': 'Blood',
                'description': 'Rapid malaria antigen detection',
                'turnaround_time': '30 minutes',
                'normal_range': {
                    'Malaria Antigen': {'unit': '', 'range': 'Negative', 'dataType': 'text', 'required': True},
                }
            },
        ]

        created_count = 0
        updated_count = 0
        skipped_count = 0

        for template_data in templates_data:
            # Add category if not specified
            if 'category' not in template_data:
                name = template_data.get('name', '').lower()
                sample_type = template_data.get('sample_type', '').lower()
                code = template_data.get('code', '').lower()

                # Determine category based on name, code, or sample type
                if any(keyword in name or keyword in code for keyword in ['cbc', 'blood count', 'hemoglobin', 'hematocrit', 'platelet', 'wbc', 'rbc', 'differential', 'esr', 'retic', 'hemoglobinopathy', 'bleeding time', 'clotting time', 'prothrombin', 'aptt', 'fibrinogen', 'd-dimer', 'iron', 'vitamin b12', 'folate', 'coombs', 'cold agglutinin', 'haptoglobin', 'ldh', 'bilirubin', 'sickle', 'g6pd', 'osmotic', 'eosinophil', 'basophil', 'monocyte', 'nrbc', 'morphology', 'malaria', 'cd4', 'blood group', 'coombs']):
                    template_data['category'] = 'hematology'
                elif any(keyword in name or keyword in code for keyword in ['culture', 'sensitivity', 'gram stain', 'afb', 'malaria', 'dengue', 'typhoid', 'h.pylori', 'hiv', 'hbsag', 'anti-hbs', 'anti-hcv', 'hav', 'hbv', 'hcv', 'syphilis', 'vdrl', 'tp-ha', 'torch', 'rubella', 'cmv', 'toxoplasma', 'herpes', 'gonorrhea', 'chlamydia', 'hpv']):
                    template_data['category'] = 'microbiology'
                elif any(keyword in name or keyword in code for keyword in ['stool', 'occult blood', 'ova', 'cysts', 'parasites']):
                    template_data['category'] = 'parasitology'
                elif any(keyword in name or keyword in code for keyword in ['urine', 'urinalysis', 'albumin', 'creatinine ratio']):
                    template_data['category'] = 'urinalysis'
                elif any(keyword in name or keyword in code for keyword in ['glucose', 'lipid', 'cholesterol', 'triglyceride', 'hdl', 'ldl', 'electrolyte', 'sodium', 'potassium', 'chloride', 'bicarbonate', 'bun', 'creatinine', 'calcium', 'phosphorus', 'magnesium', 'liver function', 'bilirubin', 'alkaline phosphatase', 'alt', 'ast', 'albumin', 'total protein', 'amylase', 'lipase', 'troponin', 'ck-mb', 'myoglobin', 'd-dimer', 'fibrinogen', 'iron profile', 'transferrin', 'ferritin', 'vitamin d', 'parathyroid', 'cortisol', 'acth', 'tsh', 't3', 't4', 'thyroid', 'testosterone', 'progesterone', 'estrogen', 'lh', 'fsh', 'prolactin', 'insulin', 'c-peptide', 'hba1c', 'fructosamine', 'microalbumin', 'beta-hcg', 'afp', 'cea', 'ca-125', 'ca-19-9', 'psa', 'free psa', 'c-reactive protein', 'rheumatoid factor', 'ana', 'anti-dsdna', 'anca', 'complement', 'immunoglobulin', 'serum protein electrophoresis']):
                    template_data['category'] = 'chemistry'
                elif any(keyword in name or keyword in code for keyword in ['pap smear', 'fluid analysis', 'ascitic', 'pleural', 'pericardial', 'csf', 'synovial']):
                    template_data['category'] = 'cytology'
                elif any(keyword in name or keyword in code for keyword in ['biopsy', 'histopathology']):
                    template_data['category'] = 'histopathology'
                elif any(keyword in name or keyword in code for keyword in ['molecular', 'pcr', 'genetic']):
                    template_data['category'] = 'molecular'
                else:
                    template_data['category'] = 'chemistry'  # Default category

            # Add default turnaround time if not specified
            if 'turnaround_time' not in template_data:
                sample_type = template_data.get('sample_type', '').lower()
                if 'blood' in sample_type:
                    template_data['turnaround_time'] = '1 hour'
                elif 'urine' in sample_type:
                    template_data['turnaround_time'] = '2 hours'
                elif 'stool' in sample_type:
                    template_data['turnaround_time'] = '24 hours'
                elif 'sputum' in sample_type:
                    template_data['turnaround_time'] = '24 hours'
                else:
                    template_data['turnaround_time'] = '4 hours'

            template, created = LabTemplate.objects.update_or_create(
                code=template_data['code'],
                defaults={
                    'name': template_data['name'],
                    'category': template_data.get('category', 'chemistry'),
                    'sample_type': template_data['sample_type'],
                    'description': template_data.get('description', ''),
                    'normal_range': template_data.get('normal_range', {}),
                    'turnaround_time': template_data.get('turnaround_time', ''),
                    'is_active': True,
                }
            )
            if created:
                created_count += 1
                self.stdout.write(self.style.SUCCESS(f'Created: {template.name} ({template.code})'))
            else:
                updated_count += 1
                self.stdout.write(self.style.WARNING(f'Updated: {template.name} ({template.code})'))

        self.stdout.write(self.style.SUCCESS(
            f'\n✓ Seeding complete!\n'
            f'  Created: {created_count} templates\n'
            f'  Updated: {updated_count} templates\n'
            f'  Total: {len(templates_data)} templates in database'
        ))

