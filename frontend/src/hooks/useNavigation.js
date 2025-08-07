import { useNavigate, useLocation } from 'react-router';
import { ROUTES } from '../config/routes';

export const useNavigation = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Helper function to create URL with query parameters
  const createUrlWithParams = (baseRoute, params = {}) => {
    const urlParams = new URLSearchParams();
    // Add all non-null/undefined parameters
    Object.entries(params).forEach(([key, value]) => {
      if (value != null) {
        urlParams.set(key, value);
      }
    });
    const queryString = urlParams.toString();
    return `${baseRoute}${queryString ? `?${queryString}` : ''}`;
  };

  const goToView = () => navigate(ROUTES.VIEW);

  const goToViewWithPreview = (path) => navigate(createUrlWithParams(ROUTES.VIEW, { path }));

  const goToEdit = (path = null) => navigate(createUrlWithParams(ROUTES.EDIT, { path }));

  const goToPublish = () => navigate(ROUTES.PUBLISH);

  const goToSubscription = (domain = null, from = null) => navigate(createUrlWithParams(ROUTES.SUBSCRIPTION, { domain, from }));

  const goToPages = (path = null) => navigate(createUrlWithParams(ROUTES.PAGES, { path }));

  const goToFiles = (path = null) => navigate(createUrlWithParams(ROUTES.FILES, { path }));

  const goToNotFound = (path = null) => navigate(createUrlWithParams(ROUTES.NOT_FOUND, { path }));

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
    goToFiles,
    goToNotFound,
    goToRoot,
    isActive,
    ROUTES,
  };
}; 