"use client";

import { useState, useMemo, useEffect } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { patientService } from '@/lib/services/patient-service';
import { 
  UserPlus, User, Phone, Heart, Users, Send, ArrowLeft, ArrowRight, 
  Briefcase, MapPin, Upload, Camera, FileText, Save, Trash2, 
  CheckCircle2, Clock, Loader2
} from 'lucide-react';

// NPA Locations
const locations = [
  "Headquarters", "Bode Thomas Clinic", "Lagos Port Complex", "Tincan Island Port Complex",
  "Rivers Port Complex", "Onne Port Complex", "Delta Port Complex", "Calabar Port", "Lekki Deep Sea Port"
];

// NPA Divisions
const divisions = [
  "Engineering", "Land & Asset Administration", "Marine and Operations", "Monitoring & Regulation",
  "HSE", "Security", "Port Managers", "HR", "Medical", "Admin", "Finance", "Superannuation & Investment",
  "Enterprise Risk Management", "Procurement", "Corporate & Strategic Communications",
  "Corporate & Strategic Planning", "Legal Services", "Audit", "ICT", "PPP",
  "Abuja Liaison Office", "Servicom", "Overseas Liaison Office", "MD's Office"
];

// Non-NPA Types
const NON_NPA_TYPES = ["Police", "IT", "NYSC", "CSR", "MD Outfit", "Board Member", "Seaview"];

// Employee Types
const employeeTypes = ["Officer", "Staff"];

// Dependent Types
const dependentTypes = ["Employee Dependent", "Retiree Dependent"];

// Titles
const titles = ['Mr', 'Mrs', 'Ms', 'Dr', 'Chief', 'Engr', 'Prof', 'Alhaji', 'Hajia'];

// Nigeria States and LGAs
type StateWithLGAs = { name: string; lgas: string[] };

const NIGERIA_STATES_AND_LGAS: StateWithLGAs[] = [
  { name: "Abia", lgas: ["Aba North", "Aba South", "Arochukwu", "Bende", "Ikwuano", "Isiala Ngwa North", "Isiala Ngwa South", "Isuikwuato", "Obi Ngwa", "Ohafia", "Osisioma", "Ugwunagbo", "Ukwa East", "Ukwa West", "Umuahia North", "Umuahia South", "Umu Nneochi"] },
  { name: "Adamawa", lgas: ["Demsa", "Fufure", "Ganye", "Gayuk", "Gombi", "Grie", "Hong", "Jada", "Lamurde", "Madagali", "Maiha", "Mayo Belwa", "Michika", "Mubi North", "Mubi South", "Numan", "Shelleng", "Song", "Toungo", "Yola North", "Yola South"] },
  { name: "Akwa Ibom", lgas: ["Abak", "Eastern Obolo", "Eket", "Esit Eket", "Essien Udim", "Etim Ekpo", "Etinan", "Ibeno", "Ibesikpo Asutan", "Ibiono-Ibom", "Ika", "Ikono", "Ikot Abasi", "Ikot Ekpene", "Ini", "Itu", "Mbo", "Mkpat-Enin", "Nsit-Atai", "Nsit-Ibom", "Nsit-Ubium", "Obot Akara", "Okobo", "Onna", "Oron", "Oruk Anam", "Udung-Uko", "Ukanafun", "Uruan", "Urue-Offong/Oruko", "Uyo"] },
  { name: "Anambra", lgas: ["Aguata", "Anambra East", "Anambra West", "Anaocha", "Awka North", "Awka South", "Ayamelum", "Dunukofia", "Ekwusigo", "Idemili North", "Idemili South", "Ihiala", "Njikoka", "Nnewi North", "Nnewi South", "Ogbaru", "Onitsha North", "Onitsha South", "Orumba North", "Orumba South", "Oyi"] },
  { name: "Bauchi", lgas: ["Alkaleri", "Bauchi", "Bogoro", "Damban", "Darazo", "Dass", "Gamawa", "Ganjuwa", "Giade", "Itas/Gadau", "Jama'are", "Katagum", "Kirfi", "Misau", "Ningi", "Shira", "Tafawa Balewa", "Toro", "Warji", "Zaki"] },
  { name: "Bayelsa", lgas: ["Brass", "Ekeremor", "Kolokuma/Opokuma", "Nembe", "Ogbia", "Sagbama", "Southern Ijaw", "Yenagoa"] },
  { name: "Benue", lgas: ["Agatu", "Apa", "Ado", "Buruku", "Gboko", "Guma", "Gwer East", "Gwer West", "Katsina-Ala", "Konshisha", "Kwande", "Logo", "Makurdi", "Obi", "Ogbadibo", "Ohimini", "Oju", "Okpokwu", "Oturkpo", "Tarka", "Ukum", "Ushongo", "Vandeikya"] },
  { name: "Borno", lgas: ["Abadam", "Askira/Uba", "Bama", "Bayo", "Biu", "Chibok", "Damboa", "Dikwa", "Gubio", "Guzamala", "Gwoza", "Hawul", "Jere", "Kaga", "Kala/Balge", "Konduga", "Kukawa", "Kwaya Kusar", "Mafa", "Magumeri", "Maiduguri", "Marte", "Mobbar", "Monguno", "Ngala", "Nganzai", "Shani"] },
  { name: "Cross River", lgas: ["Abi", "Akamkpa", "Akpabuyo", "Bakassi", "Bekwarra", "Biase", "Boki", "Calabar Municipal", "Calabar South", "Etung", "Ikom", "Obanliku", "Obubra", "Obudu", "Odukpani", "Ogoja", "Yakuur", "Yala"] },
  { name: "Delta", lgas: ["Aniocha North", "Aniocha South", "Bomadi", "Burutu", "Ethiope East", "Ethiope West", "Ika North East", "Ika South", "Isoko North", "Isoko South", "Ndokwa East", "Ndokwa West", "Okpe", "Oshimili North", "Oshimili South", "Patani", "Sapele", "Udu", "Ughelli North", "Ughelli South", "Ukwuani", "Uvwie", "Warri North", "Warri South", "Warri South West"] },
  { name: "Ebonyi", lgas: ["Abakaliki", "Afikpo North", "Afikpo South", "Ebonyi", "Ezza North", "Ezza South", "Ikwo", "Ishielu", "Ivo", "Izzi", "Ohaozara", "Ohaukwu", "Onicha"] },
  { name: "Edo", lgas: ["Akoko-Edo", "Egor", "Esan Central", "Esan North-East", "Esan South-East", "Esan West", "Etsako Central", "Etsako East", "Etsako West", "Igueben", "Ikpoba Okha", "Orhionmwon", "Oredo", "Ovia North-East", "Ovia South-West", "Owan East", "Owan West", "Uhunmwonde"] },
  { name: "Ekiti", lgas: ["Ado Ekiti", "Efon", "Ekiti East", "Ekiti South-West", "Ekiti West", "Emure", "Gbonyin", "Ido Osi", "Ijero", "Ikere", "Ikole", "Ilejemeje", "Irepodun/Ifelodun", "Ise/Orun", "Moba", "Oye"] },
  { name: "Enugu", lgas: ["Aninri", "Awgu", "Enugu East", "Enugu North", "Enugu South", "Ezeagu", "Igbo Etiti", "Igbo Eze North", "Igbo Eze South", "Isi Uzo", "Nkanu East", "Nkanu West", "Nsukka", "Oji River", "Udenu", "Udi", "Uzo Uwani"] },
  { name: "FCT", lgas: ["Abaji", "Bwari", "Gwagwalada", "Kuje", "Kwali", "Municipal Area Council"] },
  { name: "Gombe", lgas: ["Akko", "Balanga", "Billiri", "Dukku", "Funakaye", "Gombe", "Kaltungo", "Kwami", "Nafada", "Shongom", "Yamaltu/Deba"] },
  { name: "Imo", lgas: ["Aboh Mbaise", "Ahiazu Mbaise", "Ehime Mbano", "Ezinihitte", "Ideato North", "Ideato South", "Ihitte/Uboma", "Ikeduru", "Isiala Mbano", "Isu", "Mbaitoli", "Ngor Okpala", "Njaba", "Nkwerre", "Nwangele", "Obowo", "Oguta", "Ohaji/Egbema", "Okigwe", "Orlu", "Orsu", "Oru East", "Oru West", "Owerri Municipal", "Owerri North", "Owerri West", "Unuimo"] },
  { name: "Jigawa", lgas: ["Auyo", "Babura", "Biriniwa", "Birnin Kudu", "Buji", "Dutse", "Gagarawa", "Garki", "Gumel", "Guri", "Gwaram", "Gwiwa", "Hadejia", "Jahun", "Kafin Hausa", "Kazaure", "Kiri Kasama", "Kiyawa", "Kaugama", "Maigatari", "Malam Madori", "Miga", "Ringim", "Roni", "Sule Tankarkar", "Taura", "Yankwashi"] },
  { name: "Kaduna", lgas: ["Birnin Gwari", "Chikun", "Giwa", "Igabi", "Ikara", "Jaba", "Jema'a", "Kachia", "Kaduna North", "Kaduna South", "Kagarko", "Kajuru", "Kaura", "Kauru", "Kubau", "Kudan", "Lere", "Makarfi", "Sabon Gari", "Sanga", "Soba", "Zangon Kataf", "Zaria"] },
  { name: "Kano", lgas: ["Ajingi", "Albasu", "Bagwai", "Bebeji", "Bichi", "Bunkure", "Dala", "Dambatta", "Dawakin Kudu", "Dawakin Tofa", "Doguwa", "Fagge", "Gabasawa", "Garko", "Garun Mallam", "Gaya", "Gezawa", "Gwale", "Gwarzo", "Kabo", "Kano Municipal", "Karaye", "Kibiya", "Kiru", "Kumbotso", "Kunchi", "Kura", "Madobi", "Makoda", "Minjibir", "Nasarawa", "Rano", "Rimin Gado", "Rogo", "Shanono", "Sumaila", "Takai", "Tarauni", "Tofa", "Tsanyawa", "Tudun Wada", "Ungogo", "Warawa", "Wudil"] },
  { name: "Katsina", lgas: ["Bakori", "Batagarawa", "Batsari", "Baure", "Bindawa", "Charanchi", "Dandume", "Danja", "Dan Musa", "Daura", "Dutsi", "Dutsin Ma", "Faskari", "Funtua", "Ingawa", "Jibia", "Kafur", "Kaita", "Kankara", "Kankia", "Katsina", "Kurfi", "Kusada", "Mai'Adua", "Malumfashi", "Mani", "Mashi", "Matazu", "Musawa", "Rimi", "Sabuwa", "Safana", "Sandamu", "Zango"] },
  { name: "Kebbi", lgas: ["Aleiro", "Arewa Dandi", "Argungu", "Augie", "Bagudo", "Birnin Kebbi", "Bunza", "Dandi", "Fakai", "Gwandu", "Jega", "Kalgo", "Koko/Besse", "Maiyama", "Ngaski", "Sakaba", "Shanga", "Suru", "Wasagu/Danko", "Yauri", "Zuru"] },
  { name: "Kogi", lgas: ["Adavi", "Ajaokuta", "Ankpa", "Bassa", "Dekina", "Ibaji", "Idah", "Igalamela Odolu", "Ijumu", "Kabba/Bunu", "Kogi", "Lokoja", "Mopa Muro", "Ofu", "Ogori/Magongo", "Okehi", "Okene", "Olamaboro", "Omala", "Yagba East", "Yagba West"] },
  { name: "Kwara", lgas: ["Asa", "Baruten", "Edu", "Ekiti", "Ifelodun", "Ilorin East", "Ilorin South", "Ilorin West", "Irepodun", "Isin", "Kaiama", "Moro", "Offa", "Oke Ero", "Oyun", "Pategi"] },
  { name: "Lagos", lgas: ["Agege", "Ajeromi-Ifelodun", "Alimosho", "Amuwo-Odofin", "Apapa", "Badagry", "Epe", "Eti Osa", "Ibeju-Lekki", "Ifako-Ijaiye", "Ikeja", "Ikorodu", "Kosofe", "Lagos Island", "Lagos Mainland", "Mushin", "Ojo", "Oshodi-Isolo", "Shomolu", "Surulere"] },
  { name: "Nasarawa", lgas: ["Akwanga", "Awe", "Doma", "Karu", "Keana", "Keffi", "Kokona", "Lafia", "Nasarawa", "Nasarawa Egon", "Obi", "Toto", "Wamba"] },
  { name: "Niger", lgas: ["Agaie", "Agwara", "Bida", "Borgu", "Bosso", "Chanchaga", "Edati", "Gbako", "Gurara", "Katcha", "Kontagora", "Lapai", "Lavun", "Magama", "Mariga", "Mashegu", "Mokwa", "Moya", "Paikoro", "Rafi", "Rijau", "Shiroro", "Suleja", "Tafa", "Wushishi"] },
  { name: "Ogun", lgas: ["Abeokuta North", "Abeokuta South", "Ado-Odo/Ota", "Egbado North", "Egbado South", "Ewekoro", "Ifo", "Ijebu East", "Ijebu North", "Ijebu North East", "Ijebu Ode", "Ikenne", "Imeko Afon", "Ipokia", "Obafemi Owode", "Odeda", "Odogbolu", "Ogun Waterside", "Remo North", "Shagamu"] },
  { name: "Ondo", lgas: ["Akoko North-East", "Akoko North-West", "Akoko South-West", "Akoko South-East", "Akure North", "Akure South", "Ese Odo", "Idanre", "Ifedore", "Ilaje", "Ile Oluji/Okeigbo", "Irele", "Odigbo", "Okitipupa", "Ondo East", "Ondo West", "Ose", "Owo"] },
  { name: "Osun", lgas: ["Atakunmosa East", "Atakunmosa West", "Aiyedaade", "Aiyedire", "Boluwaduro", "Boripe", "Ede North", "Ede South", "Ife Central", "Ife East", "Ife North", "Ife South", "Egbedore", "Ejigbo", "Ifedayo", "Ifelodun", "Ila", "Ilesa East", "Ilesa West", "Irepodun", "Irewole", "Isokan", "Iwo", "Obokun", "Odo Otin", "Ola Oluwa", "Olorunda", "Oriade", "Orolu", "Osogbo"] },
  { name: "Oyo", lgas: ["Afijio", "Akinyele", "Atiba", "Atisbo", "Egbeda", "Ibadan North", "Ibadan North-East", "Ibadan North-West", "Ibadan South-East", "Ibadan South-West", "Ibarapa Central", "Ibarapa East", "Ibarapa North", "Ido", "Irepo", "Iseyin", "Itesiwaju", "Iwajowa", "Kajola", "Lagelu", "Ogbomosho North", "Ogbomosho South", "Ogo Oluwa", "Olorunsogo", "Oluyole", "Ona Ara", "Orelope", "Ori Ire", "Oyo East", "Oyo West", "Saki East", "Saki West", "Surulere"] },
  { name: "Plateau", lgas: ["Barkin Ladi", "Bassa", "Bokkos", "Jos East", "Jos North", "Jos South", "Kanam", "Kanke", "Langtang North", "Langtang South", "Mangu", "Mikang", "Pankshin", "Qua'an Pan", "Riyom", "Shendam", "Wase"] },
  { name: "Rivers", lgas: ["Abua/Odual", "Ahoada East", "Ahoada West", "Akuku-Toru", "Andoni", "Asari-Toru", "Bonny", "Degema", "Eleme", "Emohua", "Etche", "Gokana", "Ikwerre", "Khana", "Obio/Akpor", "Ogba/Egbema/Ndoni", "Ogu/Bolo", "Okrika", "Omuma", "Opobo/Nkoro", "Oyigbo", "Port Harcourt", "Tai"] },
  { name: "Sokoto", lgas: ["Binji", "Bodinga", "Dange Shuni", "Gada", "Goronyo", "Gudu", "Gwadabawa", "Illela", "Isa", "Kebbe", "Kware", "Rabah", "Sabon Birni", "Shagari", "Silame", "Sokoto North", "Sokoto South", "Tambuwal", "Tangaza", "Tureta", "Wamako", "Wurno", "Yabo"] },
  { name: "Taraba", lgas: ["Ardo Kola", "Bali", "Donga", "Gashaka", "Gassol", "Ibi", "Jalingo", "Karim Lamido", "Kumi", "Lau", "Sardauna", "Takum", "Ussa", "Wukari", "Yorro", "Zing"] },
  { name: "Yobe", lgas: ["Bade", "Bursari", "Damaturu", "Fika", "Fune", "Geidam", "Gujba", "Gulani", "Jakusko", "Karasuwa", "Machina", "Nangere", "Nguru", "Potiskum", "Tarmuwa", "Yunusari", "Yusufari"] },
  { name: "Zamfara", lgas: ["Anka", "Bakura", "Birnin Magaji/Kiyaw", "Bukkuyum", "Bungudu", "Gummi", "Gusau", "Kaura Namoda", "Maradun", "Maru", "Shinkafi", "Talata Mafara", "Chafe", "Zurmi"] }
];

type FormStep = 'personal' | 'work' | 'contact' | 'medical';

const STEPS: { id: FormStep; label: string; icon: React.ReactNode }[] = [
  { id: 'personal', label: 'Personal', icon: <User className="h-4 w-4" /> },
  { id: 'work', label: 'Work Info', icon: <Briefcase className="h-4 w-4" /> },
  { id: 'contact', label: 'Contact', icon: <Phone className="h-4 w-4" /> },
  { id: 'medical', label: 'Medical & NOK', icon: <Heart className="h-4 w-4" /> },
];

export default function NewPatientPage() {
  const router = useRouter();
  const [patientCategory, setPatientCategory] = useState<'employee' | 'retiree' | 'nonnpa' | 'dependent'>('employee');
  const [currentStep, setCurrentStep] = useState<FormStep>('personal');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [hasDraft, setHasDraft] = useState(false);
  const [showCategorySwitchDialog, setShowCategorySwitchDialog] = useState(false);
  const [pendingCategory, setPendingCategory] = useState<'employee' | 'retiree' | 'nonnpa' | 'dependent' | null>(null);

  const [formData, setFormData] = useState({
    // Personal Details
    personalNumber: '', title: '', surname: '', firstName: '', middleName: '', 
    gender: '', dateOfBirth: '', maritalStatus: '',
    // Work Information (Employee/Retiree)
    employeeType: '', division: '', location: '',
    // NonNPA Information
    nonNPAType: '',
    // Dependent Information
    dependentType: '', principalStaffId: '',
    // Contact Information
    email: '', phone: '', stateOfResidence: '', residentialAddress: '', 
    stateOfOrigin: '', lga: '', permanentAddress: '',
    // Medical Details
    bloodGroup: '', genotype: '',
    // Next of Kin
    nokFirstName: '', nokMiddleName: '', nokRelationship: '', nokAddress: '', nokPhone: '',
  });

  // Clear work fields when switching to retiree
  useEffect(() => {
    if (patientCategory === 'retiree') {
      setFormData(prev => ({ ...prev, employeeType: '', division: '', location: '' }));
    }
  }, [patientCategory]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (field === 'stateOfOrigin') {
      setFormData(prev => ({ ...prev, lga: '' }));
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Photo must be less than 5MB');
        return;
      }
      setPhotoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setPhotoPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const calculateAge = useMemo(() => {
    if (!formData.dateOfBirth) return '';
    const today = new Date();
    const birthDate = new Date(formData.dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age > 0 ? `${age} years` : '';
  }, [formData.dateOfBirth]);

  const availableLGAs = NIGERIA_STATES_AND_LGAS.find(s => s.name === formData.stateOfOrigin)?.lgas || [];
  const showWorkInfo = patientCategory === 'employee' || patientCategory === 'retiree';
  const showEmployeeWorkFields = patientCategory === 'employee'; // Only employees need Type, Division, Location
  const showNonNPAType = patientCategory === 'nonnpa';
  const showDependentType = patientCategory === 'dependent';

  // Calculate form completion percentage
  const completionPercentage = useMemo(() => {
    let completed = 0;
    let total = 0;

    // Required personal fields
    total += 4; // surname, firstName, gender, dateOfBirth
    if (formData.surname) completed++;
    if (formData.firstName) completed++;
    if (formData.gender) completed++;
    if (formData.dateOfBirth) completed++;

    // Work info (only for employees - retirees don't need these fields)
    if (showEmployeeWorkFields) {
      total += 3; // employeeType, division, location
      if (formData.employeeType) completed++;
      if (formData.division) completed++;
      if (formData.location) completed++;
    }

    // Contact info
    total += 1; // phone
    if (formData.phone) completed++;

    // Photo
    total += 1;
    if (photoPreview) completed++;

    return Math.round((completed / total) * 100);
  }, [formData, showWorkInfo, photoPreview]);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    
    try {
      // Validate required fields
      if (!formData.surname || !formData.firstName || !formData.gender || !formData.dateOfBirth) {
        toast.error('Please fill in all required fields');
        setIsSubmitting(false);
        return;
      }

      // Validate category-specific required fields
      if ((patientCategory === 'employee' || patientCategory === 'retiree') && !formData.personalNumber) {
        toast.error('Personal number is required for Employee and Retiree patients');
        setIsSubmitting(false);
        return;
      }

      if (patientCategory === 'nonnpa' && !formData.nonNPAType) {
        toast.error('Non-NPA type is required');
        setIsSubmitting(false);
        return;
      }

      if (patientCategory === 'dependent' && !formData.principalStaffId) {
        toast.error('Principal staff is required for Dependents');
        setIsSubmitting(false);
        return;
      }

      // Prepare API payload - map frontend field names to backend field names
      const payload: any = {
        category: patientCategory,
        surname: formData.surname.trim(),
        first_name: formData.firstName.trim(),
        middle_name: (formData.middleName || '').trim(),
        gender: formData.gender.toLowerCase(), // Backend expects lowercase: 'male', 'female'
        date_of_birth: formData.dateOfBirth,
        marital_status: (formData.maritalStatus || '').toLowerCase(), // Backend expects lowercase: 'single', 'married', etc.
        email: (formData.email || '').trim(),
        phone: (formData.phone || '').trim(),
        state_of_residence: (formData.stateOfResidence || '').trim(),
        residential_address: (formData.residentialAddress || '').trim(),
        state_of_origin: (formData.stateOfOrigin || '').trim(),
        lga: (formData.lga || '').trim(), // Keep as-is (don't lowercase - preserve original format)
        permanent_address: (formData.permanentAddress || '').trim(),
        blood_group: (formData.bloodGroup || '').trim(),
        genotype: (formData.genotype || '').trim(),
        nok_first_name: (formData.nokFirstName || '').trim(),
        nok_middle_name: (formData.nokMiddleName || '').trim(),
        nok_relationship: (formData.nokRelationship || '').trim(), // Free text - capitalize first letter for consistency
        nok_address: (formData.nokAddress || '').trim(),
        nok_phone: (formData.nokPhone || '').trim(),
      };

      // Add optional title field
      if (formData.title) {
        payload.title = formData.title.toLowerCase(); // Backend expects lowercase: 'mr', 'mrs', etc.
      }

      // Category-specific fields
      if (patientCategory === 'employee' || patientCategory === 'retiree') {
        payload.personal_number = formData.personalNumber.trim();
        if (patientCategory === 'employee' && formData.employeeType) {
          // Employee type is already capitalized in form: 'Officer', 'Staff'
          payload.employee_type = formData.employeeType.trim();
        }
        if (formData.division) payload.division = formData.division.trim();
        if (formData.location) payload.location = formData.location.trim();
      }
      
      if (patientCategory === 'nonnpa') {
        if (formData.nonNPAType) {
          payload.nonnpa_type = formData.nonNPAType.trim(); // Already capitalized in frontend
        }
        if (formData.location) payload.location = formData.location.trim();
      }
      
      if (patientCategory === 'dependent') {
        // Look up principal staff by patient_id (could be string like "E-A2962" or numeric ID)
        const principalIdStr = formData.principalStaffId.trim();
        let principalStaffNumericId: number;
        
        const parsedId = parseInt(principalIdStr, 10);
        if (!isNaN(parsedId) && parsedId > 0) {
          // It's already a numeric ID
          principalStaffNumericId = parsedId;
        } else {
          // It's a string patient_id (like "E-A2962") - search for it
          const searchResult = await patientService.getPatients({ search: principalIdStr });
          const matchedPrincipal = searchResult.results.find(
            p => p.patient_id === principalIdStr || p.patient_id.toUpperCase() === principalIdStr.toUpperCase()
          );
          if (!matchedPrincipal) {
            toast.error(`Principal staff with ID "${principalIdStr}" not found`);
            setIsSubmitting(false);
            return;
          }
          principalStaffNumericId = matchedPrincipal.id;
        }
        
        payload.principal_staff = principalStaffNumericId;
        if (formData.dependentType) {
          payload.dependent_type = formData.dependentType.trim(); // Exact match: 'Employee Dependent', 'Retiree Dependent'
        }
        if (formData.location) payload.location = formData.location.trim();
      }

      // Handle photo upload if provided
      let createdPatient: any;
      if (photoFile) {
        // Use FormData for file upload
        const formData = new FormData();
        Object.keys(payload).forEach(key => {
          const value = payload[key];
          if (value !== undefined && value !== null) {
            formData.append(key, String(value));
          }
        });
        formData.append('photo', photoFile);
        
        // Get access token
        const { getStoredAccessToken } = await import('@/lib/api-client');
        let token = getStoredAccessToken();
        
        if (!token) {
          const refreshToken = localStorage.getItem('npa_ecm_refresh_token');
          if (refreshToken) {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api';
            const baseUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
            const refreshResponse = await fetch(`${baseUrl}/accounts/auth/token/refresh/`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ refresh: refreshToken }),
            });
            
            if (refreshResponse.ok) {
              const data = await refreshResponse.json();
              token = data.access;
              localStorage.setItem('npa_ecm_access_token', data.access);
              if (data.refresh) {
                localStorage.setItem('npa_ecm_refresh_token', data.refresh);
              }
            }
          }
        }
        
        if (!token) {
          throw new Error('Authentication required. Please log in again.');
        }
        
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api';
        const baseUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
        const response = await fetch(`${baseUrl}/patients/`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
          body: formData,
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.photo?.[0] || errorData.detail || 'Failed to create patient with photo');
        }
        
        createdPatient = await response.json();
      } else {
        // No photo, use regular JSON API
        createdPatient = await patientService.createPatient(payload);
      }
      
      // Clear draft
      localStorage.removeItem('patient_register_draft');
      setHasDraft(false);
      
      toast.success('Patient registered successfully', {
        description: `Patient ID: ${createdPatient.patient_id}`,
      });
      
      // Redirect to patient detail page using the generated patient_id
      router.push(`/medical-records/patients/${createdPatient.patient_id}`);
    } catch (error: any) {
      console.error('Error registering patient:', error);
      toast.error('Failed to register patient', {
        description: error.message || 'Please check all required fields and try again',
      });
      setIsSubmitting(false);
    }
  };

  const handleSaveDraft = () => {
    const draft = { patientCategory, formData, photoPreview, savedAt: new Date().toISOString() };
    localStorage.setItem('patient_register_draft', JSON.stringify(draft));
    setHasDraft(true);
    toast.success('Draft saved');
  };

  const handleClearDraft = () => {
    localStorage.removeItem('patient_register_draft');
    setHasDraft(false);
    setFormData({
      personalNumber: '', title: '', surname: '', firstName: '', middleName: '',
      gender: '', dateOfBirth: '', maritalStatus: '',
      employeeType: '', division: '', location: '',
      nonNPAType: '',
      dependentType: '', principalStaffId: '',
      email: '', phone: '', stateOfResidence: '', residentialAddress: '',
      stateOfOrigin: '', lga: '', permanentAddress: '',
      bloodGroup: '', genotype: '',
      nokFirstName: '', nokMiddleName: '', nokRelationship: '', nokAddress: '', nokPhone: '',
    });
    setPhotoPreview(null);
    toast.info('Draft cleared');
  };

  const goToNextStep = () => {
    const currentIndex = STEPS.findIndex(s => s.id === currentStep);
    if (currentIndex < STEPS.length - 1) {
      setCurrentStep(STEPS[currentIndex + 1].id);
    }
  };

  const goToPrevStep = () => {
    const currentIndex = STEPS.findIndex(s => s.id === currentStep);
    if (currentIndex > 0) {
      setCurrentStep(STEPS[currentIndex - 1].id);
    }
  };

  const categories = [
    { id: 'employee', label: 'Employee' },
    { id: 'retiree', label: 'Retiree' },
    { id: 'nonnpa', label: 'NonNPA' },
    { id: 'dependent', label: 'Dependent' },
  ];

  const handleCategoryClick = (categoryId: 'employee' | 'retiree' | 'nonnpa' | 'dependent') => {
    if (categoryId === patientCategory) {
      return; // Already selected, do nothing
    }
    // Show confirmation dialog
    setPendingCategory(categoryId);
    setShowCategorySwitchDialog(true);
  };

  const handleConfirmCategorySwitch = () => {
    if (pendingCategory) {
      // Clear all category-specific fields when switching
      setFormData(prev => {
        const updated = {
          ...prev,
          // Employee/Retiree fields
          employeeType: '',
          division: '',
          location: '',
          // NonNPA fields
          nonNPAType: '',
          // Dependent fields
          dependentType: '',
          principalStaffId: '',
        };
        
        // Clear personalNumber if switching away from employee/retiree
        if (pendingCategory !== 'employee' && pendingCategory !== 'retiree') {
          updated.personalNumber = '';
        }
        
        return updated;
      });
      
      // Set the new category
      setPatientCategory(pendingCategory);
    }
    setShowCategorySwitchDialog(false);
    setPendingCategory(null);
  };

  const handleCancelCategorySwitch = () => {
    setShowCategorySwitchDialog(false);
    setPendingCategory(null);
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-foreground">Register Patient</h1>
          <p className="text-muted-foreground mt-1">
            Create a new patient record for NPA staff, retirees, dependents, or non-NPA visitors
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Patient Category Selection */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">Patient Category</CardTitle>
                <CardDescription>Select the category of patient being registered</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {categories.map((cat) => (
                    <Button
                      key={cat.id}
                      type="button"
                      variant={patientCategory === cat.id ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handleCategoryClick(cat.id as typeof patientCategory)}
                      className={patientCategory === cat.id ? 'bg-teal-600 hover:bg-teal-700' : ''}
                    >
                      <User className="h-4 w-4 mr-2" />
                      {cat.label}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {patientCategory === 'employee' && 'Active NPA employee with staff ID and benefits.'}
                  {patientCategory === 'retiree' && 'Former NPA staff receiving retirement benefits.'}
                  {patientCategory === 'nonnpa' && 'External visitor or contractor without NPA affiliation.'}
                  {patientCategory === 'dependent' && 'Family member of an NPA employee or retiree.'}
                </p>
              </CardContent>
            </Card>

            {/* Registration Details Card with Tabs */}
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Registration Details</CardTitle>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>{completionPercentage}% complete</span>
                  </div>
                </div>
                <Progress value={completionPercentage} className="h-1" />
              </CardHeader>
              <CardContent className="space-y-6">
                <Tabs value={currentStep} onValueChange={(v) => setCurrentStep(v as FormStep)}>
                  <TabsList className="grid w-full grid-cols-4">
                    {STEPS.map((step) => (
                      <TabsTrigger key={step.id} value={step.id} className="gap-2">
                        {step.icon}
                        <span className="hidden sm:inline">{step.label}</span>
                      </TabsTrigger>
                    ))}
                  </TabsList>

                  {/* Personal Details Tab */}
                  <TabsContent value="personal" className="space-y-4 pt-4">
                    {/* Personal Number - only for Employee/Retiree */}
                    {showWorkInfo && (
                      <div className="space-y-2">
                        <Label>Personal Number</Label>
                        <Input 
                          value={formData.personalNumber} 
                          onChange={(e) => handleInputChange('personalNumber', e.target.value)} 
                          placeholder="NPA Staff ID" 
                        />
                      </div>
                    )}

                    {/* Photo Upload */}
                    <div className="space-y-2">
                      <Label>Upload Photo</Label>
                      <div className="flex items-center gap-4">
                        <div className="w-20 h-20 rounded-lg border-2 border-dashed border-border bg-muted/30 flex items-center justify-center overflow-hidden">
                          {photoPreview ? (
                            <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                          ) : (
                            <Camera className="h-6 w-6 text-muted-foreground" />
                          )}
                        </div>
                        <div>
                          <input type="file" id="photo-upload" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                          <Button variant="outline" size="sm" onClick={() => document.getElementById('photo-upload')?.click()}>
                            <Upload className="h-4 w-4 mr-2" />
                            Choose File
                          </Button>
                          <p className="text-xs text-muted-foreground mt-1">JPG, PNG. Max 2MB</p>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Title</Label>
                        <Select value={formData.title} onValueChange={(v) => handleInputChange('title', v)}>
                          <SelectTrigger><SelectValue placeholder="Select title" /></SelectTrigger>
                          <SelectContent>
                            {titles.map(title => <SelectItem key={title} value={title.toLowerCase()}>{title}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Gender *</Label>
                        <Select value={formData.gender} onValueChange={(v) => handleInputChange('gender', v)}>
                          <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="male">Male</SelectItem>
                            <SelectItem value="female">Female</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Surname *</Label>
                      <Input value={formData.surname} onChange={(e) => handleInputChange('surname', e.target.value)} placeholder="Surname" />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>First Name *</Label>
                        <Input value={formData.firstName} onChange={(e) => handleInputChange('firstName', e.target.value)} placeholder="First name" />
                      </div>
                      <div className="space-y-2">
                        <Label>Middle Name</Label>
                        <Input value={formData.middleName} onChange={(e) => handleInputChange('middleName', e.target.value)} placeholder="Middle name" />
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="space-y-2">
                        <Label>Date of Birth *</Label>
                        <Input type="date" value={formData.dateOfBirth} onChange={(e) => handleInputChange('dateOfBirth', e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Age</Label>
                        <Input value={calculateAge} readOnly placeholder="Auto-calculated" className="bg-muted/50" />
                      </div>
                      <div className="space-y-2">
                        <Label>Marital Status</Label>
                        <Select value={formData.maritalStatus} onValueChange={(v) => handleInputChange('maritalStatus', v)}>
                          <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="single">Single</SelectItem>
                            <SelectItem value="married">Married</SelectItem>
                            <SelectItem value="divorced">Divorced</SelectItem>
                            <SelectItem value="widowed">Widowed</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="flex justify-end pt-4">
                      <Button type="button" onClick={goToNextStep}>
                        Next: Work Info
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </div>
                  </TabsContent>

                  {/* Work Information Tab */}
                  <TabsContent value="work" className="space-y-4 pt-4">
                    {showEmployeeWorkFields && (
                      <>
                        <div className="space-y-2">
                          <Label>Type *</Label>
                          <Select value={formData.employeeType} onValueChange={(v) => handleInputChange('employeeType', v)}>
                            <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                            <SelectContent>
                              {employeeTypes.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Division *</Label>
                          <Select value={formData.division} onValueChange={(v) => handleInputChange('division', v)}>
                            <SelectTrigger><SelectValue placeholder="Select division" /></SelectTrigger>
                            <SelectContent className="max-h-[250px]">
                              {divisions.map(div => <SelectItem key={div} value={div}>{div}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Location *</Label>
                          <Select value={formData.location} onValueChange={(v) => handleInputChange('location', v)}>
                            <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
                            <SelectContent>
                              {locations.map(loc => <SelectItem key={loc} value={loc}>{loc}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </>
                    )}

                    {patientCategory === 'retiree' && (
                      <div className="p-4 rounded-lg bg-muted/50 border border-muted">
                        <p className="text-sm text-muted-foreground">
                          <span className="font-medium text-foreground">Retiree Status:</span> This patient is registered as a retiree. 
                          Work-related fields (Type, Division, Location) are not required for retirees.
                        </p>
                      </div>
                    )}

                    {showNonNPAType && (
                      <>
                        <div className="space-y-2">
                          <Label>Non-NPA Type *</Label>
                          <Select value={formData.nonNPAType} onValueChange={(v) => handleInputChange('nonNPAType', v)}>
                            <SelectTrigger><SelectValue placeholder="Select non-NPA type" /></SelectTrigger>
                            <SelectContent>
                              {NON_NPA_TYPES.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Location</Label>
                          <Select value={formData.location} onValueChange={(v) => handleInputChange('location', v)}>
                            <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
                            <SelectContent>
                              {locations.map(loc => <SelectItem key={loc} value={loc}>{loc}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </>
                    )}

                    {showDependentType && (
                      <>
                        <div className="space-y-2">
                          <Label>Dependent Type *</Label>
                          <Select value={formData.dependentType} onValueChange={(v) => handleInputChange('dependentType', v)}>
                            <SelectTrigger><SelectValue placeholder="Select dependent type" /></SelectTrigger>
                            <SelectContent>
                              {dependentTypes.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Principal Staff ID *</Label>
                          <Input 
                            value={formData.principalStaffId} 
                            onChange={(e) => handleInputChange('principalStaffId', e.target.value)} 
                            placeholder="Enter principal staff/retiree ID" 
                          />
                          <p className="text-xs text-muted-foreground">The NPA staff or retiree this dependent is linked to</p>
                        </div>
                        <div className="space-y-2">
                          <Label>Location</Label>
                          <Select value={formData.location} onValueChange={(v) => handleInputChange('location', v)}>
                            <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
                            <SelectContent>
                              {locations.map(loc => <SelectItem key={loc} value={loc}>{loc}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </>
                    )}

                    <div className="flex justify-between pt-4">
                      <Button type="button" variant="outline" onClick={goToPrevStep}>
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back
                      </Button>
                      <Button type="button" onClick={goToNextStep}>
                        Next: Contact
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </div>
                  </TabsContent>

                  {/* Contact Information Tab */}
                  <TabsContent value="contact" className="space-y-4 pt-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Email</Label>
                        <Input type="email" value={formData.email} onChange={(e) => handleInputChange('email', e.target.value)} placeholder="email@example.com" />
                      </div>
                      <div className="space-y-2">
                        <Label>Phone *</Label>
                        <Input value={formData.phone} onChange={(e) => handleInputChange('phone', e.target.value)} placeholder="e.g., 08012345678" />
                      </div>
                    </div>

                    <Separator />

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>State of Residence</Label>
                        <Select value={formData.stateOfResidence} onValueChange={(v) => handleInputChange('stateOfResidence', v)}>
                          <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                          <SelectContent className="max-h-[200px]">
                            {NIGERIA_STATES_AND_LGAS.map(state => <SelectItem key={state.name} value={state.name}>{state.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label>Residential Address</Label>
                        <Textarea value={formData.residentialAddress} onChange={(e) => handleInputChange('residentialAddress', e.target.value)} placeholder="Current residential address" rows={2} />
                      </div>
                    </div>

                    <Separator />

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>State of Origin</Label>
                        <Select value={formData.stateOfOrigin} onValueChange={(v) => handleInputChange('stateOfOrigin', v)}>
                          <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                          <SelectContent className="max-h-[200px]">
                            {NIGERIA_STATES_AND_LGAS.map(state => <SelectItem key={state.name} value={state.name}>{state.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Local Government Area</Label>
                        <Select value={formData.lga} onValueChange={(v) => handleInputChange('lga', v)} disabled={!formData.stateOfOrigin || availableLGAs.length === 0}>
                          <SelectTrigger><SelectValue placeholder={formData.stateOfOrigin ? "Select LGA" : "Select state first"} /></SelectTrigger>
                          <SelectContent className="max-h-[200px]">
                            {availableLGAs.map(lga => <SelectItem key={lga} value={lga}>{lga}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Permanent Address</Label>
                      <Textarea value={formData.permanentAddress} onChange={(e) => handleInputChange('permanentAddress', e.target.value)} placeholder="Permanent home address" rows={2} />
                    </div>

                    <div className="flex justify-between pt-4">
                      <Button type="button" variant="outline" onClick={goToPrevStep}>
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back
                      </Button>
                      <Button type="button" onClick={goToNextStep}>
                        Next: Medical & NOK
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </div>
                  </TabsContent>

                  {/* Medical Details & Next of Kin Tab */}
                  <TabsContent value="medical" className="space-y-4 pt-4">
                    <div>
                      <h4 className="font-medium mb-3 flex items-center gap-2">
                        <Heart className="h-4 w-4 text-rose-500" />
                        Medical Details
                      </h4>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Blood Group</Label>
                          <Select value={formData.bloodGroup} onValueChange={(v) => handleInputChange('bloodGroup', v)}>
                            <SelectTrigger><SelectValue placeholder="Select blood group" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="A+">A+</SelectItem>
                              <SelectItem value="A-">A-</SelectItem>
                              <SelectItem value="B+">B+</SelectItem>
                              <SelectItem value="B-">B-</SelectItem>
                              <SelectItem value="AB+">AB+</SelectItem>
                              <SelectItem value="AB-">AB-</SelectItem>
                              <SelectItem value="O+">O+</SelectItem>
                              <SelectItem value="O-">O-</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Genotype</Label>
                          <Select value={formData.genotype} onValueChange={(v) => handleInputChange('genotype', v)}>
                            <SelectTrigger><SelectValue placeholder="Select genotype" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="AA">AA</SelectItem>
                              <SelectItem value="AS">AS</SelectItem>
                              <SelectItem value="SS">SS</SelectItem>
                              <SelectItem value="AC">AC</SelectItem>
                              <SelectItem value="SC">SC</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>

                    <Separator />

                    <div>
                      <h4 className="font-medium mb-3 flex items-center gap-2">
                        <Users className="h-4 w-4 text-cyan-500" />
                        Next of Kin
                      </h4>
                      <div className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label>First Name</Label>
                            <Input value={formData.nokFirstName} onChange={(e) => handleInputChange('nokFirstName', e.target.value)} placeholder="First name" />
                          </div>
                          <div className="space-y-2">
                            <Label>Middle Name</Label>
                            <Input value={formData.nokMiddleName} onChange={(e) => handleInputChange('nokMiddleName', e.target.value)} placeholder="Middle name" />
                          </div>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label>Relationship</Label>
                            <Select value={formData.nokRelationship} onValueChange={(v) => handleInputChange('nokRelationship', v)}>
                              <SelectTrigger><SelectValue placeholder="Select relationship" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Spouse">Spouse</SelectItem>
                                <SelectItem value="Parent">Parent</SelectItem>
                                <SelectItem value="Sibling">Sibling</SelectItem>
                                <SelectItem value="Child">Child</SelectItem>
                                <SelectItem value="Other">Other</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>Phone</Label>
                            <Input value={formData.nokPhone} onChange={(e) => handleInputChange('nokPhone', e.target.value)} placeholder="e.g., 08012345678" />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>Address</Label>
                          <Textarea value={formData.nokAddress} onChange={(e) => handleInputChange('nokAddress', e.target.value)} placeholder="Address" rows={2} />
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-between pt-4">
                      <Button type="button" variant="outline" onClick={goToPrevStep}>
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back
                      </Button>
                      <Button type="button" onClick={handleSubmit} disabled={isSubmitting}>
                        {isSubmitting ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Registering...
                          </>
                        ) : (
                          <>
                            <Send className="h-4 w-4 mr-2" />
                            Register Patient
                          </>
                        )}
                      </Button>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Summary Card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3 text-sm">
                  <div className="flex items-start justify-between">
                    <span className="text-muted-foreground">Category</span>
                    <Badge variant="secondary" className="capitalize">{patientCategory}</Badge>
                  </div>
                  <Separator />
                  <div className="flex items-start justify-between">
                    <span className="text-muted-foreground">Name</span>
                    <span className="font-medium text-right max-w-[150px] truncate">
                      {formData.firstName || formData.surname 
                        ? `${formData.title ? formData.title + ' ' : ''}${formData.firstName} ${formData.surname}`.trim() 
                        : '—'}
                    </span>
                  </div>
                  <div className="flex items-start justify-between">
                    <span className="text-muted-foreground">Gender</span>
                    <span className="font-medium capitalize">{formData.gender || '—'}</span>
                  </div>
                  <div className="flex items-start justify-between">
                    <span className="text-muted-foreground">Age</span>
                    <span className="font-medium">{calculateAge || '—'}</span>
                  </div>
                  {showEmployeeWorkFields && (
                    <>
                      <Separator />
                      <div className="flex items-start justify-between">
                        <span className="text-muted-foreground">Type</span>
                        <span className="font-medium capitalize">{formData.employeeType || '—'}</span>
                      </div>
                      <div className="flex items-start justify-between">
                        <span className="text-muted-foreground">Division</span>
                        <span className="font-medium text-right max-w-[150px] truncate capitalize">
                          {formData.division?.replace(/-/g, ' ') || '—'}
                        </span>
                      </div>
                      <div className="flex items-start justify-between">
                        <span className="text-muted-foreground">Location</span>
                        <span className="font-medium capitalize">{formData.location || '—'}</span>
                      </div>
                    </>
                  )}
                  {patientCategory === 'retiree' && (
                    <>
                      <Separator />
                      <div className="flex items-start justify-between">
                        <span className="text-muted-foreground">Status</span>
                        <Badge variant="secondary">Retiree</Badge>
                      </div>
                    </>
                  )}
                  <Separator />
                  <div className="flex items-start justify-between">
                    <span className="text-muted-foreground">Photo</span>
                    <div className="flex items-center gap-1">
                      {photoPreview ? (
                        <>
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                          <span>Uploaded</span>
                        </>
                      ) : (
                        <>
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground">None</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-start justify-between">
                    <span className="text-muted-foreground">Blood Group</span>
                    <span className="font-medium">{formData.bloodGroup || '—'}</span>
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Button type="button" variant="outline" size="sm" className="w-full" onClick={handleSaveDraft}>
                    <Save className="h-4 w-4 mr-2" />
                    Save Draft
                  </Button>
                  {hasDraft && (
                    <Button type="button" variant="ghost" size="sm" className="w-full text-destructive hover:text-destructive" onClick={handleClearDraft}>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Clear Draft
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Quick Links Card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Quick Links</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => router.push('/medical-records/patients')}>
                  <Users className="h-4 w-4 mr-2" />
                  Manage Patients
                </Button>
                <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => router.push('/medical-records/visits/new')}>
                  <FileText className="h-4 w-4 mr-2" />
                  Create Visit
                </Button>
                <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => router.push('/medical-records/dependents')}>
                  <Users className="h-4 w-4 mr-2" />
                  Manage Dependents
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Category Switch Confirmation Dialog */}
      <AlertDialog open={showCategorySwitchDialog} onOpenChange={setShowCategorySwitchDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Switch Patient Category?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to switch from <strong>{categories.find(c => c.id === patientCategory)?.label}</strong> to <strong>{categories.find(c => c.id === pendingCategory)?.label}</strong>?
              <br /><br />
              This will clear any category-specific information you've already entered. You'll need to fill in the new category's required fields.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelCategorySwitch}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmCategorySwitch} className="bg-teal-600 hover:bg-teal-700">
              Yes, Switch Category
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
