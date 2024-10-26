import { useNavigate, useLocation } from 'react-router';
import { ROUTES } from '../config/routes';

export const useNavigation = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const goToView = () => navigate(ROUTES.VIEW);
  const goToViewWithPreview = (previewPath) => {
    const params = new URLSearchParams();
    if (previewPath) params.set('path', previewPath);
    const queryString = params.toString();
    navigate(`${ROUTES.VIEW}${queryString ? `?${queryString}` : ''}`);
  };
  const goToEdit = (path = null) => {
    const params = new URLSearchParams();
    if (path) params.set('path', path);
    const queryString = params.toString();
    navigate(`${ROUTES.EDIT}${queryString ? `?${queryString}` : ''}`);
  };
  const goToPublish = () => navigate(ROUTES.PUBLISH);
  const goToSubscription = (domain = null, from = null) => {
    const params = new URLSearchParams();
    if (domain) params.set('domain', domain);
    if (from) params.set('from', from);
    const queryString = params.toString();
    navigate(`${ROUTES.SUBSCRIPTION}${queryString ? `?${queryString}` : ''}`);
  };
  const goToPages = () => navigate(ROUTES.PAGES);
  const goToNotFound = (path = null) => {
    const params = new URLSearchParams();
    if (path) params.set('path', path);
    const queryString = params.toString();
    navigate(`${ROUTES.NOT_FOUND}${queryString ? `?${queryString}` : ''}`);
  };
  
  const goToRoot = () => {
    // Navigate to the actual page root URL, ignoring React Router's basename
    const rootUrl = window.location.origin;
    window.location.href = rootUrl;
  };

  const isActive = (path) => location.pathname === path;

  return {
    navigate,
    location,
    goToView,
    goToViewWithPreview,
    goToEdit,
    goToPublish,
    goToSubscription,
    goToPages,
    goToNotFound,
    goToRoot,
    isActive,
    ROUTES,
  };
}; 