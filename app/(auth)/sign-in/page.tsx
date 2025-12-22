'use client';
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import InputField from "@/components/forms/InputField";

import FooterLinks from "@/components/forms/FooterLinks";
import { signInWithEmail, signUpWithEmail } from "@/lib/actions/auth.actions";
import { toast } from "sonner";

const SignIn = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const showVerifyPrompt = searchParams?.get('verify');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInFormData>({
    defaultValues: {
      email: '',
      password: '',

    },
    mode: 'onBlur',
  });

  const onSubmit = async (data: SignInFormData) => {
    try {
      const result = await signInWithEmail(data);
      if(result.success) {
        router.push('/');
        return;
      }

      const description = result.message || 'Please try again.';
      toast.error('Sign in failed', { description });

      if (description.toLowerCase().includes('verify')) {
        toast.info('Check your email inbox (and spam folder) for the verification link we sent you.');
      }
    } catch (e) {
      console.error(e);
      toast.error('Sign In failed', {
        description: e instanceof Error ? e.message : 'Failed to Sign In.'
      })
      
    }
  };

  return (
    <>
      <h1 className='form-title'>Welcome Back</h1>

      {showVerifyPrompt && (
        <p className="rounded-md bg-yellow-500/10 border border-yellow-500/40 px-4 py-3 text-sm text-yellow-100 mb-4">
          Account created! Please check your email for the verification link before signing in.
        </p>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className='space-y-5'>

        <InputField
          name='email'
          label='Email'
          placeholder='Jeremy@Clarkson.com'
          register={register}
          error={errors.email}
          validation={{ required: "Email is required", pattern: { value: /^\S+@\S+$/i, message: "Invalid email address" } }}
        />
        <InputField
          name='password'
          label='Password'
          placeholder='Enter a strong password'
          type="password"
          register={register}
          error={errors.password}
          validation={{ required: "Password is required", minLength: 8 }}
        />


        <Button
          type='submit'
          disabled={isSubmitting}
          className='yellow-btn w-full mt-5'
        >
          {isSubmitting ? 'Signing in' : 'Sign In'}
        </Button>

                <FooterLinks text="Don't have an account?" linkText="Sign up" href="/sign-up" />
      </form>
    </>
  );
};

export default SignIn;
