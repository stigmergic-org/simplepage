import React, { useState, useEffect } from 'react';
import { useRepo } from '../hooks/useRepo';
import LoadingSpinner from '../components/LoadingSpinner';
import Navbar from '../components/navbar';
import TimelineConnections from '../components/TimelineConnections';
import TimelineEntry from '../components/TimelineEntry';


// Mock data with multiple parents to demonstrate parallel functionality
const mockHistoryData = [
  {
    cid: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
    tx: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    blockNumber: "19876543",
    parents: ["bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi2"],
    version: "1.5.0",
    domain: "example.eth",
    timestamp: "2024-01-19T10:30:00Z"
  },
  {
    cid: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi2",
    tx: "0x2345678901bcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    blockNumber: "19876540",
    parents: ["bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi3"],
    version: "1.4.0",
    domain: "example.eth",
    timestamp: "2024-01-15T09:15:00Z"
  },
  {
    cid: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi3",
    tx: "0x3456789012cdef1234567890abcdef1234567890abcdef1234567890abcdef",
    blockNumber: "19876538",
    parents: ["bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi4"],
    version: "1.3.0",
    domain: "example.eth",
    timestamp: "2024-01-13T08:45:00Z"
  },
  {
    cid: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi4",
    tx: "0x4567890123def1234567890abcdef1234567890abcdef1234567890abcdef",
    blockNumber: "19876535",
    parents: ["bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi6", "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi5", "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi7"],
    version: "1.3.0",
    domain: "example.eth",
    timestamp: "2024-01-12T07:20:00Z"
  },
  {
    cid: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi6",
    tx: "0x6789012345f1234567890abcdef1234567890abcdef1234567890abcdef",
    blockNumber: "19876533",
    parents: ["bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi8"],
    version: "1.1.0",
    domain: "example.eth",
    timestamp: "2024-01-11T05:00:00Z"
  },
  {
    cid: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi5",
    tx: "0x5678901234ef1234567890abcdef1234567890abcdef1234567890abcdef",
    blockNumber: "19876532",
    parents: ["bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi8"],
    version: "1.0.0",
    domain: "example.eth",
    timestamp: "2024-01-10T06:10:00Z"
  },
  {
    cid: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi7",
    tx: "0x5678901234ef1234567890abcdef1234567890abcdef1234567890abcdef",
    blockNumber: "19876531",
    // parents: [],
    parents: ["bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi8"],
    version: "1.0.0",
    domain: "example.eth",
    timestamp: "2024-01-09T06:10:00Z"
  },
  {
    cid: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi8",
    tx: "0x5678901234ef1234567890abcdef1234567890abcdef1234567890abcdef",
    blockNumber: "19876530",
    parents: ["bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi9"],
    version: "1.0.0",
    domain: "example.eth",
    timestamp: "2024-01-08T06:10:00Z"
  },
  {
    cid: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi9",
    tx: "0x5678901234ef1234567890abcdef1234567890abcdef1234567890abcdef",
    blockNumber: "19876529",
    parents: [],
    version: "1.0.0",
    domain: "example.eth",
    timestamp: "2024-01-07T06:10:00Z"
  }
];

// Calculate column positions for each commit
const calculateColumnLayout = (historyData) => {
  const columnsByCid = {}
  let maxColumn = 0
  
  // Process commits in order (latest first)
  // historyData.forEach((entry, index) => {
  //   if (!columnsByCid[entry.cid]) {
  //     if (index > 0 && !historyData[index - 1]?.parents.find(cid => cid === entry.cid)) {
  //       columnsByCid[entry.cid] = 
  //       columnsByCid[entry.cid] = columnsByCid[historyData[index - 1].cid] + 1
  //       maxColumn = Math.max(maxColumn, columnsByCid[entry.cid])
  //     } else {
  //       columnsByCid[entry.cid] = 0
  //     }
  //   } else {
  //     columnsByCid[entry.cid] = 0
  //   }
  //   let column = 0

  //   for (const parentCid of entry.parents) {
  //     if (!columnsByCid[parentCid]) {
  //       columnsByCid[parentCid] = column
  //       maxColumn = Math.max(maxColumn, column)
  //       column++
  //     }
  //   }
  // });

  const processEntryRecurively = (entry, columnIdx) => {
    console.log('processing entry', entry.cid, columnIdx)
    if (columnsByCid[entry.cid] === undefined) {
      columnsByCid[entry.cid] = columnIdx
      maxColumn = Math.max(maxColumn, columnIdx)


    let column = columnIdx
    for (const parentCid of entry.parents) {
      if (!columnsByCid[parentCid]) {
        // console.log('processEntryRecurively: parentCid', parentCid)
        // console.log('processEntryRecurively: column', column)

        const parentEntry = historyData.find(e => e.cid === parentCid)
        console.log('processEntryRecurively: parentEntry', parentEntry)

        processEntryRecurively(parentEntry, column)
        column++
      }
    }
    }
  }

  let c = 0
  // if (historyData?.[0]) {
  //   processEntryRecurively(historyData?.[0], 0)
  // }
  for (const entry of historyData) {
    if (columnsByCid[entry.cid] === undefined) {
      console.log('processEntryRecurively: entry', entry)
      processEntryRecurively(entry, c)
      c++
    }
  }
  // historyData.forEach(entry => {
  //   processEntryRecurively(entry, c)
  //   c++
  // });

  
  console.log('maxColumn', maxColumn)
  return { columnsByCid, maxColumn };
};

const HistoryPage = () => {
  const { repo } = useRepo();
  const [historyData, setHistoryData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        setLoading(true);
        
        // For now, always use mock data to test the UI
        // console.log('Using mock data:', mockHistoryData);
        // setHistoryData(mockHistoryData);


        const data = await repo.history.get();
        console.log('hisotry page: data', data)
        setHistoryData(data)
        
      } catch (err) {
        console.error('Error fetching history:', err);
        setError(err.message);
        // Fallback to mock data
        setHistoryData(mockHistoryData);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [repo]);

  // Create a map of entries for easy lookup
  const entryMap = new Map();
  historyData.forEach(entry => {
    entry.cid = entry.cid.toString()
    entry.parents = entry.parents.map(cid => cid.toString())
    entryMap.set(entry.cid, entry);
  });

  const { columnsByCid, maxColumn } = calculateColumnLayout(historyData);
  console.log('history page: columnsByCid', columnsByCid)


  if (loading) {
    return (
      <>
        <Navbar activePage="History" />
        <LoadingSpinner />
      </>
    );
  }

  if (error) {
    return (
      <>
        <Navbar activePage="History" />
        <div className="min-h-screen flex items-center justify-center">
          <div className="alert alert-error max-w-md">
            <span>Error loading history: {error}</span>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar activePage="History" />
      
      <div className="container mx-auto max-w-555 px-4 py-6">

        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2">Website History</h1>
            <p className="text-base-content/70">
              Timeline showing the evolution of this website
            </p>
          </div>
          
          <div className="bg-base-100 rounded-lg p-8">
            {historyData.length > 0 ? (
              <div className="relative">
                {/* SVG overlay for drawing lines across all entries */}
                <TimelineConnections historyData={historyData} entryMap={entryMap} columnsByCid={columnsByCid} />
                
                {/* Timeline entries */}
                <div className="space-y-0">
                  {historyData.map((entry, index) => (
                    <TimelineEntry 
                      key={entry.cid}
                      entry={entry} 
                      index={index}
                      columnsByCid={columnsByCid}
                      maxColumn={maxColumn}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="text-base-content/50 text-lg">No history available</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default HistoryPage;
