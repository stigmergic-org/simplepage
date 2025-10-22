import React from 'react';
import Navbar from '../components/navbar';
import { useNavigation } from '../hooks/useNavigation';
import { usePagePath } from '../hooks/usePagePath';
import { useRepo, ensurePageExists } from '../hooks/useRepo';

const NotFound = () => {
  const { path } = usePagePath();
  const { goToRoot, goToEdit } = useNavigation();
  const { repo } = useRepo();

  const handleCreatePage = async () => {
    try {
      await ensurePageExists(repo, path);
      goToEdit(path);
    } catch (error) {
      console.error('Error creating page:', error);
      // Fallback to direct navigation if ensurePageExists fails
      goToEdit(path);
    }
  };


  return (
    <>
      <Navbar />
      <div id="content" className="min-h-70 flex items-center justify-center pt-6">
        <div className="w-full max-w-3xl px-20 text-center">
          <div className="mb-8">
            <h1 className="text-6xl font-bold text-gray-300 mb-4">404</h1>
            <h2 className="text-2xl font-semibold mb-4">Page Not Found</h2>
            <p className="text-gray-600 mb-6">
              The page <code className="bg-gray-100 px-2 py-1 rounded">{path}</code> doesn&apos;t exist yet.
            </p>
          </div>
          
          <div className="space-y-4">
            <button 
              onClick={handleCreatePage}
              className="btn btn-primary btn-lg"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Create This Page
            </button>
            
            <div className="text-sm text-gray-500">
              or
            </div>
            
            <button 
              onClick={goToRoot}
              className="btn btn-ghost btn-lg"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              Go to Homepage
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default NotFound; 