import { useMutation } from '@tanstack/react-query';
import { shareViewFormSubmit } from '@teable-group/openapi';
import { useContext } from 'react';
import { FormPreviewer } from '../../../view/form/components';
import { ShareViewPageContext } from '../ShareViewPageContext';

export const FormView = () => {
  const { shareId } = useContext(ShareViewPageContext);
  const { mutateAsync } = useMutation({
    mutationFn: shareViewFormSubmit,
  });
  const onSubmit = async (fields: Record<string, unknown>) => {
    await mutateAsync({ shareId, fields });
  };
  return (
    <div className="flex h-full w-full">
      <FormPreviewer submit={onSubmit} />
    </div>
  );
};