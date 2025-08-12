# Supabase Configuration for Authentication

The auth callback error you're seeing is due to PKCE configuration. Here's how to fix it:

## 🔧 **Fix in Supabase Dashboard**

1. **Go to your Supabase project dashboard**
2. **Navigate to Authentication > Settings**
3. **Scroll to "Auth flow configuration"**
4. **Set the following:**

### **Site URL**
```
http://localhost:3000
```

### **Redirect URLs** (add both):
```
http://localhost:3000/auth/callback
http://localhost:3000/auth/confirm
```

### **PKCE Settings**
- **Uncheck "Enable PKCE"** (this is the key fix!)
- OR set **"PKCE verification method"** to **"S256"**

## 🔧 **Alternative: Manual Login for Testing**

If you're still having issues, you can test authentication manually:

1. **Go to Supabase Dashboard > Authentication > Users**
2. **Click "Add user"**
3. **Add email/password directly**
4. **Set "Email confirmed" to true**
5. **Go to `http://localhost:3000/auth/login`**
6. **Login with the credentials**

## 🧪 **Test Steps**

After configuration:

1. **Clear browser cookies/localStorage**
2. **Go to `http://localhost:3000/auth/signup`**
3. **Create new account**
4. **Check email for confirmation**
5. **Click confirmation link**
6. **Should redirect to dashboard**

## 🚨 **Common Issues**

### **PKCE Error**
- Disable PKCE in Supabase settings
- OR ensure your auth flow supports PKCE properly

### **Redirect URL Mismatch**
- Make sure redirect URLs are exactly configured in Supabase
- Include both `/auth/callback` and `/auth/confirm`

### **Email Not Confirmed**
- Check if email confirmation is required
- Or manually confirm in Supabase dashboard

## ✅ **Quick Fix**

For immediate testing, disable email confirmation:

1. **Supabase Dashboard > Authentication > Settings**
2. **Uncheck "Enable email confirmations"**
3. **Users will be automatically confirmed**

This will make signup work immediately without email confirmation!