'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Sun, Moon, Monitor, Palette, Save, Loader2 } from 'lucide-react';

type Theme = 'light' | 'dark' | 'system';
type Density = 'comfortable' | 'compact';
type AccentColor = 'blue' | 'green' | 'purple' | 'orange' | 'red';

export function ThemeSettings() {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  
  // Theme preferences state
  const [theme, setTheme] = useState<Theme>('system');
  const [density, setDensity] = useState<Density>('comfortable');
  const [accentColor, setAccentColor] = useState<AccentColor>('blue');
  const [reducedMotion, setReducedMotion] = useState(false);

  // Load preferences from localStorage on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as Theme;
    const savedDensity = localStorage.getItem('density') as Density;
    const savedAccentColor = localStorage.getItem('accentColor') as AccentColor;
    const savedReducedMotion = localStorage.getItem('reducedMotion') === 'true';

    if (savedTheme) setTheme(savedTheme);
    if (savedDensity) setDensity(savedDensity);
    if (savedAccentColor) setAccentColor(savedAccentColor);
    setReducedMotion(savedReducedMotion);
  }, []);

  const handleSavePreferences = () => {
    setLoading(true);
    
    // Save to localStorage
    localStorage.setItem('theme', theme);
    localStorage.setItem('density', density);
    localStorage.setItem('accentColor', accentColor);
    localStorage.setItem('reducedMotion', reducedMotion.toString());

    // Apply theme immediately
    applyTheme();
    
    setTimeout(() => {
      setLoading(false);
      setSuccess('Theme preferences saved successfully!');
      setTimeout(() => setSuccess(''), 3000);
    }, 500);
  };

  const applyTheme = () => {
    const root = document.documentElement;
    
    // Apply theme
    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      root.classList.toggle('dark', systemTheme === 'dark');
    } else {
      root.classList.toggle('dark', theme === 'dark');
    }

    // Apply density
    root.classList.toggle('compact', density === 'compact');
    
    // Apply accent color (you would implement CSS custom properties for this)
    root.style.setProperty('--accent-color', getAccentColorValue(accentColor));
    
    // Apply reduced motion
    if (reducedMotion) {
      root.style.setProperty('--animation-duration', '0s');
    } else {
      root.style.removeProperty('--animation-duration');
    }
  };

  const getAccentColorValue = (color: AccentColor): string => {
    const colors = {
      blue: 'hsl(221.2 83.2% 53.3%)',
      green: 'hsl(142.1 76.2% 36.3%)',
      purple: 'hsl(262.1 83.3% 57.8%)',
      orange: 'hsl(24.6 95% 53.1%)',
      red: 'hsl(346.8 77.2% 49.8%)',
    };
    return colors[color];
  };

  const getThemeIcon = (themeType: Theme) => {
    switch (themeType) {
      case 'light':
        return <Sun className="h-4 w-4" />;
      case 'dark':
        return <Moon className="h-4 w-4" />;
      case 'system':
        return <Monitor className="h-4 w-4" />;
    }
  };

  const getAccentColorClass = (color: AccentColor) => {
    const classes = {
      blue: 'bg-blue-500',
      green: 'bg-green-500',
      purple: 'bg-purple-500',
      orange: 'bg-orange-500',
      red: 'bg-red-500',
    };
    return classes[color];
  };

  return (
    <div className="space-y-6">
      {success && (
        <Alert>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      {/* Theme Selection */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Palette className="h-5 w-5" />
          <h3 className="text-lg font-medium">Theme</h3>
        </div>
        
        <div className="grid grid-cols-3 gap-3">
          {(['light', 'dark', 'system'] as const).map((themeOption) => (
            <button
              key={themeOption}
              type="button"
              onClick={() => setTheme(themeOption)}
              className={`p-3 rounded-lg border-2 transition-colors ${
                theme === themeOption
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <div className="flex flex-col items-center gap-2">
                {getThemeIcon(themeOption)}
                <span className="text-sm font-medium capitalize">
                  {themeOption}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Accent Color */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium">Accent Color</h3>
        
        <div className="flex gap-3">
          {(['blue', 'green', 'purple', 'orange', 'red'] as const).map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => setAccentColor(color)}
              className={`w-8 h-8 rounded-full ${getAccentColorClass(color)} ${
                accentColor === color
                  ? 'ring-2 ring-offset-2 ring-primary'
                  : 'hover:scale-110'
              } transition-all`}
              title={color.charAt(0).toUpperCase() + color.slice(1)}
            />
          ))}
        </div>
      </div>

      {/* Layout Density */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium">Layout Density</h3>
        
        <div className="grid grid-cols-2 gap-3">
          {(['comfortable', 'compact'] as const).map((densityOption) => (
            <button
              key={densityOption}
              type="button"
              onClick={() => setDensity(densityOption)}
              className={`p-3 rounded-lg border-2 text-left transition-colors ${
                density === densityOption
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <div className="space-y-1">
                <div className="font-medium capitalize">{densityOption}</div>
                <div className="text-xs text-muted-foreground">
                  {densityOption === 'comfortable' 
                    ? 'More spacing and larger elements'
                    : 'Tighter spacing for more content'
                  }
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Accessibility */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium">Accessibility</h3>
        
        <div className="space-y-3">
          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              id="reducedMotion"
              checked={reducedMotion}
              onChange={(e) => setReducedMotion(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            <Label htmlFor="reducedMotion" className="text-sm">
              Reduce motion and animations
            </Label>
          </div>
          <p className="text-xs text-muted-foreground ml-7">
            Minimizes animations for users who prefer reduced motion
          </p>
        </div>
      </div>

      {/* Preview */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium">Preview</h3>
        
        <div className="p-4 border rounded-lg space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">Sample Dashboard Card</h4>
            <div className="flex gap-2">
              <div className={`w-3 h-3 rounded-full ${getAccentColorClass(accentColor)}`} />
              <div className="text-xs text-muted-foreground">
                {theme === 'system' ? 'Auto' : theme}
              </div>
            </div>
          </div>
          <div className="text-sm text-muted-foreground">
            This is how your dashboard content will appear with the selected theme and settings.
          </div>
          <div className="flex gap-2">
            <Button size="sm" className={`${getAccentColorClass(accentColor)} text-white`}>
              Primary Button
            </Button>
            <Button size="sm" variant="outline">
              Secondary Button
            </Button>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end pt-4 border-t">
        <Button onClick={handleSavePreferences} disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Applying...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Apply Theme
            </>
          )}
        </Button>
      </div>
    </div>
  );
}