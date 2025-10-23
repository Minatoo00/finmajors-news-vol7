export type UpdatePersonFormState = {
  status: 'idle' | 'success' | 'error';
  message?: string;
};

export const initialUpdatePersonFormState: UpdatePersonFormState = {
  status: 'idle',
};

