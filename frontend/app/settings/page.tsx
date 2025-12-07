"use client";

import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import { useCurrentUser } from "@/hooks/use-current-user";
import { apiFetch, hasTokens } from "@/lib/api-client";
import {
  User,
  Bell,
  Palette,
  Shield,
  Save,
  Moon,
  Sun,
  Monitor,
  Lock,
  Mail,
  Phone,
  Loader2,
} from "lucide-react";

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { currentUser, refresh: refreshUser } = useCurrentUser();

  // Profile state
  const [profile, setProfile] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    bio: "",
  });
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Notification preferences state
  const [notificationPrefs, setNotificationPrefs] = useState({
    inAppEnabled: true,
    emailEnabled: true,
    criticalAlerts: true,
    labResults: true,
    radiologyResults: true,
    prescriptionReady: true,
    appointmentReminders: true,
  });
  const [isSavingNotifications, setIsSavingNotifications] = useState(false);

  // Password change state
  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({});
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Load user profile data
  useEffect(() => {
    const loadProfile = async () => {
      if (!hasTokens() || !currentUser) return;

      try {
        const userData = await apiFetch<{
          first_name?: string;
          last_name?: string;
          email?: string;
          phone?: string;
          bio?: string;
        }>("/accounts/auth/me/");
        setProfile({
          firstName: userData.first_name || "",
          lastName: userData.last_name || "",
          email: userData.email || currentUser.email || "",
          phone: userData.phone || "",
          bio: userData.bio || "",
        });
      } catch (error) {
        console.error("Failed to load user profile", error);
      }
    };

    if (currentUser) {
      void loadProfile();
    }
  }, [currentUser]);

  // Validation helpers
  const validateEmail = (email: string): string | null => {
    if (!email) return "Email is required";
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return "Please enter a valid email address";
    return null;
  };

  const validatePhone = (phone: string): string | null => {
    if (!phone) return null;
    const phoneRegex = /^[\d\s\-\+\(\)]+$/;
    if (!phoneRegex.test(phone)) return "Please enter a valid phone number";
    return null;
  };

  const validatePassword = (password: string): string | null => {
    if (!password) return "Password is required";
    if (password.length < 8) return "Password must be at least 8 characters long";
    if (!/(?=.*[a-z])/.test(password)) return "Password must contain at least one lowercase letter";
    if (!/(?=.*[A-Z])/.test(password)) return "Password must contain at least one uppercase letter";
    if (!/(?=.*\d)/.test(password)) return "Password must contain at least one number";
    return null;
  };

  const handleSaveProfile = async () => {
    const errors: Record<string, string> = {};
    const emailError = validateEmail(profile.email);
    if (emailError) errors.email = emailError;

    const phoneError = validatePhone(profile.phone);
    if (phoneError) errors.phone = phoneError;

    if (Object.keys(errors).length > 0) {
      setProfileErrors(errors);
      toast.error("Please fix the errors before saving");
      return;
    }

    setProfileErrors({});
    setIsSavingProfile(true);

    try {
      await apiFetch("/accounts/auth/me/", {
        method: "PATCH",
        body: JSON.stringify({
          first_name: profile.firstName,
          last_name: profile.lastName,
          email: profile.email,
          phone: profile.phone,
          bio: profile.bio,
        }),
      });

      await refreshUser();
      toast.success("Profile updated successfully");
    } catch (error: any) {
      console.error("Failed to save profile", error);
      toast.error(error?.message || "Failed to save profile. Please try again.");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleSaveNotifications = async () => {
    setIsSavingNotifications(true);

    try {
      // In a real implementation, this would call an API endpoint
      // For now, we'll just save to localStorage
      localStorage.setItem("emr_notification_prefs", JSON.stringify(notificationPrefs));
      toast.success("Notification preferences saved");
    } catch (error) {
      console.error("Failed to save notification preferences", error);
      toast.error("Failed to save notification preferences. Please try again.");
    } finally {
      setIsSavingNotifications(false);
    }
  };

  const handleChangePassword = async () => {
    const errors: Record<string, string> = {};

    if (!passwordData.currentPassword) {
      errors.currentPassword = "Current password is required";
    }

    const newPasswordError = validatePassword(passwordData.newPassword);
    if (newPasswordError) {
      errors.newPassword = newPasswordError;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      errors.confirmPassword = "Passwords do not match";
    }

    if (Object.keys(errors).length > 0) {
      setPasswordErrors(errors);
      return;
    }

    setPasswordErrors({});
    setIsChangingPassword(true);

    try {
      await apiFetch("/accounts/auth/change-password/", {
        method: "POST",
        body: JSON.stringify({
          current_password: passwordData.currentPassword,
          new_password: passwordData.newPassword,
          confirm_password: passwordData.confirmPassword,
        }),
      });

      toast.success("Password changed successfully");
      setPasswordData({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
    } catch (error: any) {
      console.error("Failed to change password", error);
      const errorMessage = error?.detail || error?.message || "Failed to change password";
      toast.error(errorMessage);
      if (error?.response?.data) {
        setPasswordErrors(error.response.data);
      }
    } finally {
      setIsChangingPassword(false);
    }
  };

  // Load notification preferences from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("emr_notification_prefs");
    if (saved) {
      try {
        setNotificationPrefs(JSON.parse(saved));
      } catch (e) {
        // Ignore parse errors
      }
    }
  }, []);

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-muted-foreground mt-1">
            Manage your account settings and preferences
          </p>
        </div>

        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList>
            <TabsTrigger value="profile">
              <User className="h-4 w-4 mr-2" />
              Profile
            </TabsTrigger>
            <TabsTrigger value="notifications">
              <Bell className="h-4 w-4 mr-2" />
              Notifications
            </TabsTrigger>
            <TabsTrigger value="appearance">
              <Palette className="h-4 w-4 mr-2" />
              Appearance
            </TabsTrigger>
            <TabsTrigger value="security">
              <Shield className="h-4 w-4 mr-2" />
              Security
            </TabsTrigger>
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Profile Information</CardTitle>
                <CardDescription>
                  Update your personal information and contact details.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      placeholder="Enter your first name"
                      value={profile.firstName}
                      onChange={(e) => {
                        setProfile({ ...profile, firstName: e.target.value });
                        if (profileErrors.firstName) {
                          setProfileErrors({ ...profileErrors, firstName: "" });
                        }
                      }}
                    />
                    {profileErrors.firstName && (
                      <p className="text-sm text-destructive">{profileErrors.firstName}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      placeholder="Enter your last name"
                      value={profile.lastName}
                      onChange={(e) => {
                        setProfile({ ...profile, lastName: e.target.value });
                        if (profileErrors.lastName) {
                          setProfileErrors({ ...profileErrors, lastName: "" });
                        }
                      }}
                    />
                    {profileErrors.lastName && (
                      <p className="text-sm text-destructive">{profileErrors.lastName}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="Enter your email"
                    value={profile.email}
                    onChange={(e) => {
                      setProfile({ ...profile, email: e.target.value });
                      if (profileErrors.email) {
                        setProfileErrors({ ...profileErrors, email: "" });
                      }
                    }}
                  />
                  {profileErrors.email && (
                    <p className="text-sm text-destructive">{profileErrors.email}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">
                    Phone Number <span className="text-muted-foreground text-xs">(Optional)</span>
                  </Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="Enter your phone number"
                    value={profile.phone}
                    onChange={(e) => {
                      setProfile({ ...profile, phone: e.target.value });
                      if (profileErrors.phone) {
                        setProfileErrors({ ...profileErrors, phone: "" });
                      }
                    }}
                  />
                  {profileErrors.phone && (
                    <p className="text-sm text-destructive">{profileErrors.phone}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bio">
                    Bio <span className="text-muted-foreground text-xs">(Optional)</span>
                  </Label>
                  <Textarea
                    id="bio"
                    placeholder="Tell us a bit about yourself..."
                    value={profile.bio}
                    onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground">{profile.bio.length}/500 characters</p>
                </div>

                {/* Read-only Organization Info */}
                {currentUser && (
                  <div className="p-4 bg-muted/50 rounded-lg space-y-3">
                    <p className="text-sm font-medium">Organization Details</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Role</p>
                        <p className="font-medium">{currentUser.systemRole || "Not set"}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Department</p>
                        <p className="font-medium">{currentUser.department || "Not assigned"}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Division</p>
                        <p className="font-medium">{currentUser.division || "Not assigned"}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Employee ID</p>
                        <p className="font-medium">{currentUser.employeeId || "Not set"}</p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Contact your administrator to update organization details.
                    </p>
                  </div>
                )}

                <Button onClick={handleSaveProfile} disabled={isSavingProfile}>
                  {isSavingProfile ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save Changes
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notifications Tab */}
          <TabsContent value="notifications" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Notification Preferences</CardTitle>
                <CardDescription>
                  Choose how you want to be notified about important events and updates.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>In-App Notifications</Label>
                      <p className="text-sm text-muted-foreground">
                        Receive notifications within the application
                      </p>
                    </div>
                    <Switch
                      checked={notificationPrefs.inAppEnabled}
                      onCheckedChange={(checked) =>
                        setNotificationPrefs({ ...notificationPrefs, inAppEnabled: checked })
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Email Notifications</Label>
                      <p className="text-sm text-muted-foreground">Receive notifications via email</p>
                    </div>
                    <Switch
                      checked={notificationPrefs.emailEnabled}
                      onCheckedChange={(checked) =>
                        setNotificationPrefs({ ...notificationPrefs, emailEnabled: checked })
                      }
                    />
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h3 className="text-sm font-semibold">Alert Types</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-sm">Critical Alerts</Label>
                        <p className="text-xs text-muted-foreground">
                          Urgent patient alerts and critical results
                        </p>
                      </div>
                      <Switch
                        checked={notificationPrefs.criticalAlerts}
                        onCheckedChange={(checked) =>
                          setNotificationPrefs({ ...notificationPrefs, criticalAlerts: checked })
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-sm">Lab Results</Label>
                        <p className="text-xs text-muted-foreground">
                          When laboratory test results are ready
                        </p>
                      </div>
                      <Switch
                        checked={notificationPrefs.labResults}
                        onCheckedChange={(checked) =>
                          setNotificationPrefs({ ...notificationPrefs, labResults: checked })
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-sm">Radiology Results</Label>
                        <p className="text-xs text-muted-foreground">
                          When radiology reports are ready
                        </p>
                      </div>
                      <Switch
                        checked={notificationPrefs.radiologyResults}
                        onCheckedChange={(checked) =>
                          setNotificationPrefs({ ...notificationPrefs, radiologyResults: checked })
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-sm">Prescription Ready</Label>
                        <p className="text-xs text-muted-foreground">
                          When prescriptions are ready for pickup
                        </p>
                      </div>
                      <Switch
                        checked={notificationPrefs.prescriptionReady}
                        onCheckedChange={(checked) =>
                          setNotificationPrefs({ ...notificationPrefs, prescriptionReady: checked })
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-sm">Appointment Reminders</Label>
                        <p className="text-xs text-muted-foreground">
                          Reminders for upcoming appointments
                        </p>
                      </div>
                      <Switch
                        checked={notificationPrefs.appointmentReminders}
                        onCheckedChange={(checked) =>
                          setNotificationPrefs({
                            ...notificationPrefs,
                            appointmentReminders: checked,
                          })
                        }
                      />
                    </div>
                  </div>
                </div>

                <Button onClick={handleSaveNotifications} disabled={isSavingNotifications}>
                  {isSavingNotifications ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save Preferences
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Appearance Tab */}
          <TabsContent value="appearance" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Theme Settings</CardTitle>
                <CardDescription>Customize the appearance of the application</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <Label>Color Theme</Label>
                  <div className="grid grid-cols-3 gap-4">
                    <Button
                      variant={theme === "light" ? "default" : "outline"}
                      className="h-20 flex-col gap-2"
                      onClick={() => setTheme("light")}
                    >
                      <Sun className="h-6 w-6" />
                      Light
                    </Button>
                    <Button
                      variant={theme === "dark" ? "default" : "outline"}
                      className="h-20 flex-col gap-2"
                      onClick={() => setTheme("dark")}
                    >
                      <Moon className="h-6 w-6" />
                      Dark
                    </Button>
                    <Button
                      variant={theme === "system" ? "default" : "outline"}
                      className="h-20 flex-col gap-2"
                      onClick={() => setTheme("system")}
                    >
                      <Monitor className="h-6 w-6" />
                      System
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Security Tab */}
          <TabsContent value="security" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Change Password</CardTitle>
                <CardDescription>
                  Use a strong password with at least 8 characters, including uppercase, lowercase,
                  and numbers.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="current-password">Current Password</Label>
                  <Input
                    id="current-password"
                    type="password"
                    placeholder="Enter current password"
                    value={passwordData.currentPassword}
                    onChange={(e) => {
                      setPasswordData({ ...passwordData, currentPassword: e.target.value });
                      if (passwordErrors.currentPassword) {
                        setPasswordErrors({ ...passwordErrors, currentPassword: "" });
                      }
                    }}
                  />
                  {passwordErrors.currentPassword && (
                    <p className="text-sm text-destructive">{passwordErrors.currentPassword}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-password">New Password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    placeholder="Enter new password"
                    value={passwordData.newPassword}
                    onChange={(e) => {
                      setPasswordData({ ...passwordData, newPassword: e.target.value });
                      if (passwordErrors.newPassword) {
                        setPasswordErrors({ ...passwordErrors, newPassword: "" });
                      }
                    }}
                  />
                  {passwordErrors.newPassword && (
                    <p className="text-sm text-destructive">{passwordErrors.newPassword}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm New Password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    placeholder="Confirm new password"
                    value={passwordData.confirmPassword}
                    onChange={(e) => {
                      setPasswordData({ ...passwordData, confirmPassword: e.target.value });
                      if (passwordErrors.confirmPassword) {
                        setPasswordErrors({ ...passwordErrors, confirmPassword: "" });
                      }
                    }}
                  />
                  {passwordErrors.confirmPassword && (
                    <p className="text-sm text-destructive">{passwordErrors.confirmPassword}</p>
                  )}
                </div>
                <Button onClick={handleChangePassword} disabled={isChangingPassword}>
                  {isChangingPassword ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Changing...
                    </>
                  ) : (
                    <>
                      <Lock className="h-4 w-4 mr-2" />
                      Change Password
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

